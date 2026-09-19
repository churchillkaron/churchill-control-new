import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildTemporalTasteMemory,
} from "../lib/creative/learning/runtime/CreativeTemporalTasteMemoryRuntime.js";
const dailies = fs.readFileSync("lib/creative/production-room/runtime/CreativeDailiesRoomRuntime.js", "utf8");
const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
const productionLearning = fs.readFileSync("lib/creative/learning/runtime/CreativeProductionLearningRuntime.js", "utf8");
const bridge = fs.readFileSync("lib/creative/quality/runtime/CreativePerceptualCandidateSelectionBridgeBootstrap.js", "utf8");

test("dailies emits structured learning signal", () => {
  assert.match(dailies, /CREATIVE_DAILIES_LEARNING_SIGNAL_V1/);
  assert.match(dailies, /rejected_families/);
  assert.match(dailies, /weakest_families/);
  assert.match(dailies, /failure_codes/);
  assert.match(dailies, /repair_focus/);
  assert.match(dailies, /dailies_learning_signal/);
});

test("taste memory extracts recurring rejection patterns", () => {
  const memory = buildTemporalTasteMemory({
    learning: {
      production_learning: {
        evidence: {
          rejection_reason_frequency: {
            TEMPORAL_GAME_CAMERA_FORBIDDEN: 4,
            camera_score: 3,
            one_off: 1,
          },
          accepted_rejected_pairs: [
            { shot_id: "s1", accepted_quality: 97, rejected_quality: 71, rejection_reasons: ["TEMPORAL_GAME_CAMERA_FORBIDDEN"] },
          ],
        },
      },
    },
  });
  assert.equal(memory.preproduction_learning_gate.repeated_rejection_threshold, 2);
  assert.ok(memory.recurring_rejection_patterns.some((entry) => entry.reason === "TEMPORAL_GAME_CAMERA_FORBIDDEN"));
  assert.equal(memory.accepted_rejected_examples.length, 1);
});

test("temporal planner receives taste memory as evidence", () => {
  assert.match(temporal, /ADVISORY TASTE MEMORY/);
  assert.match(temporal, /Repeated rejection patterns must be explicitly avoided/);
  assert.match(productionLearning, /accepted_rejected_pairs/);
  assert.match(productionLearning, /dimension_scores/);
  assert.match(productionLearning, /accepted_craft_profile/);
  assert.match(productionLearning, /rejected_craft_profile/);
  assert.match(productionLearning, /dailies_learning_signal/);
  assert.match(bridge, /shot_candidate_dimension_scores/);
  assert.match(bridge, /shot_candidate_craft_profile/);
  assert.match(bridge, /failure_codes/);
  assert.match(bridge, /repair_focus/);
});
