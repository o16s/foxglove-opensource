// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { normalizeTopic } from "./normalizeTopic";

describe("normalizeTopic", () => {
  it("adds leading slash when missing", () => {
    expect(normalizeTopic("imu/data")).toBe("/imu/data");
  });

  it("preserves existing leading slash", () => {
    expect(normalizeTopic("/imu/data")).toBe("/imu/data");
  });

  it("handles single-segment topic", () => {
    expect(normalizeTopic("camera")).toBe("/camera");
  });

  it("handles already-slashed single-segment topic", () => {
    expect(normalizeTopic("/camera")).toBe("/camera");
  });

  it("handles deeply nested topic", () => {
    expect(normalizeTopic("robot/arm/joint1/state")).toBe("/robot/arm/joint1/state");
  });
});
