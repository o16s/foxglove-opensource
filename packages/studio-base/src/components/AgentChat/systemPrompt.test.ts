// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { buildSystemPrompt } from "./systemPrompt";

describe("buildSystemPrompt", () => {
  it("includes panel type information", () => {
    const prompt = buildSystemPrompt(["3D", "Image", "Plot"]);
    expect(prompt).toContain("3D");
    expect(prompt).toContain("Image");
    expect(prompt).toContain("Plot");
  });

  it("includes layout structure explanation", () => {
    const prompt = buildSystemPrompt(["3D"]);
    expect(prompt).toContain("mosaic");
    expect(prompt).toContain("direction");
  });

  it("is a non-empty string", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt.length).toBeGreaterThan(100);
  });
});
