import assert from "node:assert/strict";
import test from "node:test";

import {
  directCreativeStillRepairs,
} from "../lib/creative/stills/runtime/CreativeStillRepairDirectorRuntime.js";

test("repair director fixes typography deterministically and anatomy locally before regeneration", () => {
  const result = directCreativeStillRepairs({
    failures: ["TEXT_OVERFLOW", "STILL_WORLD_CLASS_BELOW_FLOOR:anatomy:90:94"],
  });
  assert.equal(result.repairs[0].capability, "creative.design.repair");
  assert.ok(result.repairs.some((repair) => repair.capability === "ai.image.inpaint"));
  assert.equal(result.source_regeneration_required, false);
});
test("unknown catastrophic failure escalates only source asset regeneration", () => {
  const result = directCreativeStillRepairs({
    failures: ["UNRECOGNIZABLE_STORY_WORLD"],
  });
  assert.equal(result.source_regeneration_required, true);
  assert.equal(
    result.repairs[0].regeneration_scope,
    "SOURCE_ASSET_ONLY_AFTER_BOUNDED_REPAIR_IS_PROVEN_INSUFFICIENT",
  );
  assert.equal(result.whole_project_regeneration_forbidden, true);
});
