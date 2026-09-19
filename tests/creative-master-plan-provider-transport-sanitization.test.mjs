import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeMasterPlanRuntime.js", import.meta.url),
  "utf8",
);

test("master planning strips provider transport details before validation", () => {
  assert.match(source, /PROVIDER_TRANSPORT_PLAN_KEYS/);
  for (const key of ["prompt", "provider_prompt", "negative_prompt", "visual_prompt", "video_prompt", "provider_parameters"]) {
    assert.match(source, new RegExp(`\\"${key}\\"`));
  }
  assert.match(source, /stripProviderTransportDetails\(plan\)/);
});
