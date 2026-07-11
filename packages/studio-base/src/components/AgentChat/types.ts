// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

export type ChatRole = "user" | "assistant" | "system" | "tool";

export type ToolCall = {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatMessage = {
  role: ChatRole;
  content: string | undefined;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};
