// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { WEBLLM_MODELS, getModelsForRAM } from "./webllmModels";

describe("WEBLLM_MODELS", () => {
  it("has at least one model", () => {
    expect(WEBLLM_MODELS.length).toBeGreaterThan(0);
  });

  it("every model has required fields", () => {
    for (const model of WEBLLM_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.label).toBeTruthy();
      expect(model.vramGB).toBeGreaterThan(0);
    }
  });
});

describe("getModelsForRAM", () => {
  it("returns only models that fit within the VRAM budget (75% of stated RAM)", () => {
    const models = getModelsForRAM(8);
    // 75% of 8 GB = 6 GB VRAM budget
    for (const model of models) {
      expect(model.vramGB).toBeLessThanOrEqual(6);
    }
    expect(models.length).toBeGreaterThan(0);
  });

  it("returns more models for higher RAM tiers", () => {
    const models8 = getModelsForRAM(8);
    const models16 = getModelsForRAM(16);
    expect(models16.length).toBeGreaterThanOrEqual(models8.length);
  });

  it("returns no models when RAM is too low", () => {
    const models = getModelsForRAM(1);
    expect(models).toHaveLength(0);
  });
});
