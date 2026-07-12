// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { ToolDefinition } from "./types";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_topics",
      description:
        "List all available topics in the current data source with their schema names.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_topics",
      description:
        "Search topics by name or schema type. Returns matching topics.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query to match against topic name or schema" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_panel_types",
      description:
        "List all available panel types that can be added to the layout (e.g. 3D, Image, Plot, RawMessages).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_topic_fields",
      description:
        "Get all plottable field paths for a specific topic. Returns dot-separated paths like 'linear_acceleration.x'.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Exact topic name from list_topics" },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_topic_fields",
      description:
        "Search all topics for fields matching a query. Useful when the user mentions a field name but not the full topic path. Returns [{topic, path}] matches.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Field name or partial match to search for" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_layout",
      description:
        "Get the current layout structure (mosaic tree) and panel configurations.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_panel",
      description:
        "Add a new panel to the current layout. Returns the new panel ID.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description: "Panel type (e.g. 'Image', 'Plot', '3D', 'RawMessages')",
          },
          config: {
            type: "object",
            description:
              "Panel configuration. For Image: { imageTopic: 'exact_topic_name' }. For Plot: { paths: [{ value: 'topic.field', enabled: true, timestampMethod: 'receiveTime' }] }. For 3D: {}. For RawMessages: { topicPath: 'exact_topic_name' }. Use exact topic names from list_topics — do NOT add a leading slash.",
          },
        },
        required: ["type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_layout",
      description:
        "Replace the entire layout with a new mosaic tree and panel configs. Use this to arrange multiple panels side by side or stacked.",
      parameters: {
        type: "object",
        properties: {
          layout: {
            description:
              "Mosaic layout tree. A leaf is a panel ID string (e.g. 'Image!abc'). A branch is { direction: 'row'|'column', first: node, second: node, splitPercentage?: number }.",
          },
          configs: {
            type: "object",
            description:
              "Map of panel ID to panel config. Each panel ID in the layout tree must have a config entry.",
          },
        },
        required: ["layout", "configs"],
      },
    },
  },
];
