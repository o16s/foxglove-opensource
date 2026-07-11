// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { runAgentLoop } from "./agentLoop";
import { ChatMessage, ToolDefinition } from "./types";

describe("runAgentLoop", () => {
  it("returns assistant text when model responds without tool calls", async () => {
    const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];
    const tools: ToolDefinition[] = [];

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: "assistant",
              content: "Hi there!",
            },
            finish_reason: "stop",
          },
        ],
      }),
    });

    const result = await runAgentLoop({
      messages,
      tools,
      fetchFn: mockFetch,
      executeTool: jest.fn(),
      apiEndpoint: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-4o",
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]).toEqual({
      role: "assistant",
      content: "Hi there!",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("executes tool calls and loops until model responds with text", async () => {
    const messages: ChatMessage[] = [{ role: "user", content: "List topics" }];
    const tools: ToolDefinition[] = [
      {
        type: "function",
        function: {
          name: "list_topics",
          description: "List available topics",
          parameters: { type: "object", properties: {} },
        },
      },
    ];

    const mockFetch = jest
      .fn()
      // First call: model wants to call a tool
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    function: { name: "list_topics", arguments: "{}" },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
      })
      // Second call: model responds with final text
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: "Here are the topics: /cam, /imu",
              },
              finish_reason: "stop",
            },
          ],
        }),
      });

    const executeTool = jest.fn().mockResolvedValue('["/cam", "/imu"]');

    const result = await runAgentLoop({
      messages,
      tools,
      fetchFn: mockFetch,
      executeTool,
      apiEndpoint: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-4o",
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(executeTool).toHaveBeenCalledWith("list_topics", {});
    expect(result.messages).toHaveLength(4); // user, assistant(tool_call), tool_result, assistant(text)
    expect(result.messages[2]).toEqual({
      role: "tool",
      content: '["/cam", "/imu"]',
      tool_call_id: "call_1",
    });
    expect(result.messages[3]!.content).toBe("Here are the topics: /cam, /imu");
  });

  it("throws on API error", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(
      runAgentLoop({
        messages: [{ role: "user", content: "Hi" }],
        tools: [],
        fetchFn: mockFetch,
        executeTool: jest.fn(),
        apiEndpoint: "https://api.openai.com/v1",
        apiKey: "bad-key",
        model: "gpt-4o",
      }),
    ).rejects.toThrow("API request failed: 401");
  });

  it("stops after max iterations to prevent infinite loops", async () => {
    // Model always returns tool calls, never stops
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                { id: "call_x", function: { name: "noop", arguments: "{}" } },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
    });

    const result = await runAgentLoop({
      messages: [{ role: "user", content: "loop forever" }],
      tools: [
        {
          type: "function",
          function: {
            name: "noop",
            description: "does nothing",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
      fetchFn: mockFetch,
      executeTool: jest.fn().mockResolvedValue("ok"),
      apiEndpoint: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-4o",
    });

    // 10 iterations: each adds 1 assistant + 1 tool message = 20, plus the initial user message = 21
    expect(mockFetch).toHaveBeenCalledTimes(10);
    expect(result.messages).toHaveLength(21);
  });
});
