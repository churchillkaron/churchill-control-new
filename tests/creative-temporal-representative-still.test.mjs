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
});
