// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { TOOL_DEFINITIONS } from "./toolDefinitions";

describe("TOOL_DEFINITIONS", () => {
  it("exports an array of valid tool definitions", () => {
    expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);

    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters).toBeDefined();
    }
  });

  it("includes all expected tools", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.function.name);
    expect(names).toContain("list_topics");
    expect(names).toContain("search_topics");
    expect(names).toContain("get_panel_types");
    expect(names).toContain("get_current_layout");
    expect(names).toContain("add_panel");
    expect(names).toContain("set_layout");
    expect(names).toContain("get_topic_fields");
    expect(names).toContain("search_topic_fields");
    expect(names).toContain("get_incidents");
    expect(names).toContain("seek_to_time");
    expect(names).toContain("read_field_values");
    expect(names).toContain("get_statistics");
    expect(names).toContain("find_peaks");
    expect(names).toContain("search_recordings");
    expect(names).toContain("load_recordings");
    expect(names).toContain("annotate_plot");
  });
});
