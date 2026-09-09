import test from "node:test";
import assert from "node:assert/strict";
import { CreativeTemporalRepresentativeStillRuntime } from "../lib/creative/director/runtime/CreativeTemporalRepresentativeStillRuntime.js";

test("representative still rejects unreadable opening in favor of readable hero state", () => {
  const result = CreativeTemporalRepresentativeStillRuntime.select({ shot: { frame_plan: {
    opening_frame: "Helicopter appears as a small dot on the horizon and platform is barely visible.",
    progression: "Helicopter approaches the offshore platform and industrial geometry resolves.",
    closing_frame: "Helicopter and offshore platform are fully visible with readable helideck detail."
  }}});
  assert.equal(result.frame_source, "CLOSING_FRAME");
  assert.match(result.frame, /fully visible/i);
  assert.deepEqual(result.rejected_low_visibility_frames, ["OPENING_FRAME"]);
  assert.equal(result.hero_subject_prominence.primary_subject_min_frame_occupancy_percent, 22);
  assert.equal(result.hero_subject_prominence.horizon_must_not_dominate_composition, true);
  assert.equal(result.spatial_composition.duplicate_secondary_subjects_forbidden, true);
  assert.equal(result.spatial_composition.subject_count.secondary, 1);
});
