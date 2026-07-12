// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

jest.mock("@mlc-ai/web-llm", () => {
  const engines = new Map<string, { unload: jest.Mock }>();

  return {
    CreateMLCEngine: jest.fn(async (modelId: string, opts?: { initProgressCallback?: (progress: { text: string; progress: number }) => void }) => {
      // Simulate progress callback
      opts?.initProgressCallback?.({ text: "Downloading...", progress: 0.5 });
      opts?.initProgressCallback?.({ text: "Ready", progress: 1.0 });

      const engine = {
        chat: { completions: { create: jest.fn() } },
        unload: jest.fn(),
      };
      engines.set(modelId, engine);
      return engine;
    }),
    _engines: engines,
  };
});

import { initWebLLMEngine, getWebLLMStatus, subscribeWebLLMStatus, resetWebLLMEngine } from "./webllmEngine";

beforeEach(() => {
  resetWebLLMEngine();
  const webllm = jest.requireMock("@mlc-ai/web-llm");
  webllm.CreateMLCEngine.mockClear();
});

describe("WebLLM engine singleton", () => {
  it("starts in idle status", () => {
    expect(getWebLLMStatus()).toEqual({ state: "idle" });
  });

  it("transitions to loading and then ready when initialized", async () => {
    const states: string[] = [];
    const unsub = subscribeWebLLMStatus((status) => {
      states.push(status.state);
    });

    const engine = await initWebLLMEngine("test-model-1");
    unsub();

    expect(engine).toBeDefined();
    expect(engine.chat).toBeDefined();
    expect(getWebLLMStatus()).toEqual({ state: "ready" });
    expect(states).toContain("loading");
    expect(states).toContain("ready");
  });

  it("reuses engine when same model requested", async () => {
    const engine1 = await initWebLLMEngine("test-model-1");
    const engine2 = await initWebLLMEngine("test-model-1");

    expect(engine1).toBe(engine2);

    // CreateMLCEngine should only be called once
    const webllm = jest.requireMock("@mlc-ai/web-llm");
    expect(webllm.CreateMLCEngine).toHaveBeenCalledTimes(1);
  });

  it("unloads old engine and creates new one when model changes", async () => {
    const engine1 = await initWebLLMEngine("model-a");
    const engine2 = await initWebLLMEngine("model-b");

    expect(engine1).not.toBe(engine2);
    expect(engine1.unload).toHaveBeenCalled();
  });

  it("sets error status when engine creation fails", async () => {
    const webllm = jest.requireMock("@mlc-ai/web-llm");
    webllm.CreateMLCEngine.mockRejectedValueOnce(new Error("WebGPU not available"));

    await expect(initWebLLMEngine("bad-model")).rejects.toThrow("WebGPU not available");
    expect(getWebLLMStatus()).toEqual({ state: "error", error: "WebGPU not available" });
  });
});
