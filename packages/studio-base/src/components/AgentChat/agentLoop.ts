// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { ChatMessage, ToolDefinition } from "./types";

export type ExecuteToolFn = (name: string, args: Record<string, unknown>) => Promise<string>;

export type AgentLoopParams = {
  messages: ChatMessage[];
  tools: ToolDefinition[];
  fetchFn: typeof fetch;
  executeTool: ExecuteToolFn;
  apiEndpoint: string;
  apiKey: string;
  model: string;
};

export type AgentLoopResult = {
  messages: ChatMessage[];
};

const MAX_ITERATIONS = 10;

async function callApi(
  fetchFn: typeof fetch,
  apiEndpoint: string,
  apiKey: string,
  model: string,
  conversation: ChatMessage[],
  tools: ToolDefinition[],
) {
  const response = await fetchFn(`${apiEndpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: conversation,
      ...(tools.length > 0 ? { tools } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}

export async function runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
  const { messages, tools, fetchFn, executeTool, apiEndpoint, apiKey, model } = params;
  const conversation = [...messages];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const data = await callApi(fetchFn, apiEndpoint, apiKey, model, conversation, tools);
    const choice = data.choices[0];
    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: choice.message.content ?? undefined,
      ...(choice.message.tool_calls ? { tool_calls: choice.message.tool_calls } : {}),
    };
    conversation.push(assistantMessage);

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      break;
    }

    for (const toolCall of assistantMessage.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      const result = await executeTool(toolCall.function.name, args);
      conversation.push({
        role: "tool",
        content: result,
        tool_call_id: toolCall.id,
      });
    }
  }

  return { messages: conversation };
}
