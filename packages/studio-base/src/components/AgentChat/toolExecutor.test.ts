// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { createToolExecutor, StudioContext } from "./toolExecutor";

describe("createToolExecutor", () => {
  const makeContext = (overrides?: Partial<StudioContext>): StudioContext => ({
    topics: [
      { name: "/camera/image", schemaName: "sensor_msgs/Image" },
      { name: "/imu/data", schemaName: "sensor_msgs/Imu" },
      { name: "/odom", schemaName: "nav_msgs/Odometry" },
    ],
    datatypes: new Map(),
    panelTypes: ["3D", "Image", "Plot", "RawMessages"],
    currentLayout: { layout: "3D!abc123", configById: {} },
    addPanel: jest.fn(),
    changePanelLayout: jest.fn(),
    savePanelConfigs: jest.fn(),
    ...overrides,
  });

  it("list_topics returns all topics as JSON", async () => {
    const ctx = makeContext();
    const execute = createToolExecutor(ctx);

    const result = await execute("list_topics", {});
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({ name: "/camera/image", schemaName: "sensor_msgs/Image" });
  });

  it("search_topics filters by query", async () => {
    const ctx = makeContext();
    const execute = createToolExecutor(ctx);

    const result = await execute("search_topics", { query: "camera" });
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.name).toBe("/camera/image");
  });

  it("get_panel_types returns available panel types", async () => {
    const ctx = makeContext();
    const execute = createToolExecutor(ctx);

    const result = await execute("get_panel_types", {});
    const parsed = JSON.parse(result);

    expect(parsed).toEqual(["3D", "Image", "Plot", "RawMessages"]);
  });

  it("get_current_layout returns layout and configs", async () => {
    const ctx = makeContext({
      currentLayout: {
        layout: {
          direction: "row",
          first: "Image!abc",
          second: "Plot!def",
          splitPercentage: 50,
        },
        configById: { "Image!abc": { topic: "/camera/image" } },
      },
    });
    const execute = createToolExecutor(ctx);

    const result = await execute("get_current_layout", {});
    const parsed = JSON.parse(result);

    expect(parsed.layout.direction).toBe("row");
    expect(parsed.configById["Image!abc"]).toEqual({ topic: "/camera/image" });
  });

  it("add_panel calls addPanel with correct payload", async () => {
    const addPanel = jest.fn();
    const ctx = makeContext({ addPanel });
    const execute = createToolExecutor(ctx);

    const result = await execute("add_panel", {
      type: "Plot",
      config: { paths: [{ value: "/imu/data.linear_acceleration.x", enabled: true }] },
    });

    expect(addPanel).toHaveBeenCalledTimes(1);
    const payload = addPanel.mock.calls[0]![0];
    expect(payload.id).toMatch(/^Plot!/);
    expect(payload.config).toEqual({
      paths: [{ value: "/imu/data.linear_acceleration.x", enabled: true }],
    });
    expect(result).toContain("Plot!");
  });

  it("set_layout calls changePanelLayout and savePanelConfigs", async () => {
    const changePanelLayout = jest.fn();
    const savePanelConfigs = jest.fn();
    const ctx = makeContext({ changePanelLayout, savePanelConfigs });
    const execute = createToolExecutor(ctx);

    const layout = { direction: "row", first: "Image!x1", second: "Plot!x2" };
    const configs = {
      "Image!x1": { topic: "/camera/image" },
      "Plot!x2": { paths: [] },
    };

    const result = await execute("set_layout", { layout, configs });

    expect(changePanelLayout).toHaveBeenCalledWith({ layout });
    expect(savePanelConfigs).toHaveBeenCalledWith({
      configs: [
        { id: "Image!x1", config: { topic: "/camera/image" }, override: true },
        { id: "Plot!x2", config: { paths: [] }, override: true },
      ],
    });
    expect(result).toBe("Layout updated");
  });

  it("get_topic_fields returns field paths for a topic", async () => {
    const ctx = makeContext({
      datatypes: new Map([
        [
          "sensor_msgs/Imu",
          {
            name: "sensor_msgs/Imu",
            definitions: [
              { name: "linear_acceleration", type: "geometry_msgs/Vector3", isComplex: true },
              { name: "angular_velocity", type: "geometry_msgs/Vector3", isComplex: true },
            ],
          },
        ],
        [
          "geometry_msgs/Vector3",
          {
            name: "geometry_msgs/Vector3",
            definitions: [
              { name: "x", type: "float64" },
              { name: "y", type: "float64" },
              { name: "z", type: "float64" },
            ],
          },
        ],
      ]),
    });
    const execute = createToolExecutor(ctx);

    const result = await execute("get_topic_fields", { topic: "/imu/data" });
    const parsed = JSON.parse(result) as string[];

    expect(parsed).toContain("linear_acceleration.x");
    expect(parsed).toContain("linear_acceleration.y");
    expect(parsed).toContain("linear_acceleration.z");
    expect(parsed).toContain("angular_velocity.x");
  });

  it("search_topic_fields finds fields matching a query across all topics", async () => {
    const ctx = makeContext({
      datatypes: new Map([
        [
          "sensor_msgs/Imu",
          {
            name: "sensor_msgs/Imu",
            definitions: [
              { name: "linear_acceleration", type: "geometry_msgs/Vector3", isComplex: true },
            ],
          },
        ],
        [
          "geometry_msgs/Vector3",
          {
            name: "geometry_msgs/Vector3",
            definitions: [
              { name: "x", type: "float64" },
              { name: "y", type: "float64" },
              { name: "z", type: "float64" },
            ],
          },
        ],
        [
          "custom/Vibration",
          {
            name: "custom/Vibration",
            definitions: [
              { name: "alert_acc_peak", type: "float64" },
              { name: "temperature", type: "float64" },
            ],
          },
        ],
      ]),
      topics: [
        { name: "/imu/data", schemaName: "sensor_msgs/Imu" },
        { name: "iolink/vibration1/pdin", schemaName: "custom/Vibration" },
      ],
    });
    const execute = createToolExecutor(ctx);

    const result = await execute("search_topic_fields", { query: "alert_acc_peak" });
    const parsed = JSON.parse(result) as Array<{ topic: string; path: string }>;

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({ topic: "iolink/vibration1/pdin", path: "alert_acc_peak" });
  });

  it("throws on unknown tool name", async () => {
    const ctx = makeContext();
    const execute = createToolExecutor(ctx);

    await expect(execute("nonexistent_tool", {})).rejects.toThrow("Unknown tool: nonexistent_tool");
  });
});
