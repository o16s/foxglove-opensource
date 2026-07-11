// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { MosaicNode } from "react-mosaic-component";

import { AddPanelPayload, ChangePanelLayoutPayload, SaveConfigsPayload } from "@foxglove/studio-base/context/CurrentLayoutContext/actions";
import { Immutable } from "@foxglove/studio";
import { RosDatatypes } from "@foxglove/studio-base/types/RosDatatypes";
import { getPanelIdForType } from "@foxglove/studio-base/util/layout";

export type TopicInfo = {
  name: string;
  schemaName: string | undefined;
};

export type StudioContext = {
  topics: TopicInfo[];
  datatypes: Immutable<RosDatatypes>;
  panelTypes: string[];
  currentLayout: { layout: MosaicNode<string> | undefined; configById: Record<string, unknown> };
  addPanel: (payload: AddPanelPayload) => void;
  changePanelLayout: (payload: ChangePanelLayoutPayload) => void;
  savePanelConfigs: (payload: SaveConfigsPayload) => void;
};

export type ToolExecutorFn = (name: string, args: Record<string, unknown>) => Promise<string>;

function getFieldPaths(
  schemaName: string,
  datatypes: Immutable<RosDatatypes>,
  prefix: string = "",
  maxDepth: number = 4,
): string[] {
  if (maxDepth <= 0) return [];
  const schema = datatypes.get(schemaName);
  if (!schema) return [];

  const paths: string[] = [];
  for (const field of schema.definitions) {
    const fieldPath = prefix ? `${prefix}.${field.name}` : field.name;
    if (field.isComplex) {
      paths.push(...getFieldPaths(field.type, datatypes, fieldPath, maxDepth - 1));
    } else {
      paths.push(fieldPath);
    }
  }
  return paths;
}

export function createToolExecutor(ctx: StudioContext): ToolExecutorFn {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
    list_topics: async (): Promise<string> => {
      return JSON.stringify(ctx.topics) as string;
    },

    search_topics: async (args): Promise<string> => {
      const query = (args.query as string ?? "").toLowerCase();
      const matches = ctx.topics.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          (t.schemaName?.toLowerCase().includes(query) ?? false),
      );
      return JSON.stringify(matches) as string;
    },

    get_panel_types: async (): Promise<string> => {
      return JSON.stringify(ctx.panelTypes) as string;
    },

    get_topic_fields: async (args): Promise<string> => {
      const topicName = args.topic as string;
      const topic = ctx.topics.find((t) => t.name === topicName);
      if (!topic?.schemaName) {
        return JSON.stringify([]) as string;
      }
      const paths = getFieldPaths(topic.schemaName, ctx.datatypes);
      return JSON.stringify(paths) as string;
    },

    search_topic_fields: async (args): Promise<string> => {
      const query = (args.query as string ?? "").toLowerCase();
      const results: Array<{ topic: string; path: string }> = [];
      for (const topic of ctx.topics) {
        if (!topic.schemaName) continue;
        const paths = getFieldPaths(topic.schemaName, ctx.datatypes);
        for (const path of paths) {
          if (path.toLowerCase().includes(query)) {
            results.push({ topic: topic.name, path });
          }
        }
      }
      return JSON.stringify(results) as string;
    },

    get_current_layout: async (): Promise<string> => {
      return JSON.stringify(ctx.currentLayout) as string;
    },

    add_panel: async (args) => {
      const panelType = args.type as string;
      const config = (args.config as Record<string, unknown>) ?? {};
      const id = getPanelIdForType(panelType);
      ctx.addPanel({ id, config });
      return id;
    },

    set_layout: async (args) => {
      const layout = args.layout as MosaicNode<string>;
      const configs = (args.configs as Record<string, Record<string, unknown>>) ?? {};
      ctx.changePanelLayout({ layout });
      ctx.savePanelConfigs({
        configs: Object.entries(configs).map(([id, config]) => ({
          id,
          config,
          override: true,
        })),
      });
      return "Layout updated";
    },
  };

  return async (name: string, args: Record<string, unknown>): Promise<string> => {
    const handler = handlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return handler(args);
  };
}
