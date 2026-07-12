// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import type { WebLLMEngine } from "./completionProvider";

export type WebLLMStatus =
  | { state: "idle" }
  | { state: "loading"; progress?: number; text?: string }
  | { state: "ready" }
  | { state: "error"; error: string };

type EngineWithUnload = WebLLMEngine & { unload: () => void };

let currentEngine: EngineWithUnload | undefined;
let currentModelId: string | undefined;
let currentStatus: WebLLMStatus = { state: "idle" };
const listeners = new Set<(status: WebLLMStatus) => void>();

function setStatus(status: WebLLMStatus) {
  currentStatus = status;
  for (const listener of listeners) {
    listener(status);
  }
}

export function getWebLLMStatus(): WebLLMStatus {
  return currentStatus;
}

export function subscribeWebLLMStatus(
  listener: (status: WebLLMStatus) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function initWebLLMEngine(modelId: string): Promise<EngineWithUnload> {
  if (currentEngine && currentModelId === modelId) {
    return currentEngine;
  }

  if (currentEngine) {
    currentEngine.unload();
    currentEngine = undefined;
    currentModelId = undefined;
  }

  setStatus({ state: "loading" });

  try {
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
    const engine = (await CreateMLCEngine(modelId, {
      initProgressCallback: (progress: { text: string; progress: number }) => {
        setStatus({ state: "loading", progress: progress.progress, text: progress.text });
      },
    })) as EngineWithUnload;

    currentEngine = engine;
    currentModelId = modelId;
    setStatus({ state: "ready" });
    return engine;
  } catch (err) {
    setStatus({ state: "error", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

/** Reset singleton state — for testing only. */
export function resetWebLLMEngine(): void {
  currentEngine = undefined;
  currentModelId = undefined;
  currentStatus = { state: "idle" };
  listeners.clear();
}
