// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { ChatCompletionProvider, trimConversation } from "./completionProvider";
import { ChatMessage, ToolDefinition } from "./types";

export type ExecuteToolFn = (name: string, args: Record<string, unknown>) => Promise<string>;

export type AgentLoopParams = {
  messages: ChatMessage[];
  tools: ToolDefinition[];
  completionProvider: ChatCompletionProvider;
  executeTool: ExecuteToolFn;
};

export type AgentLoopResult = {
  messages: ChatMessage[];
};

const MAX_ITERATIONS = 10;

export async function runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
  const { messages, tools, completionProvider, executeTool } = params;
  const conversation = [...messages];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const trimmed = trimConversation(conversation);
    const data = await completionProvider({ messages: trimmed, tools });
    const choice = data.choices[0];

    if (!choice) {
      conversation.push({ role: "assistant", content: "No response from model." });
      break;
    }

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
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      } catch (err) {
        conversation.push({
          role: "tool",
          content: `Error parsing arguments: ${err instanceof Error ? err.message : String(err)}`,
          tool_call_id: toolCall.id,
        });
        continue;
      }
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
