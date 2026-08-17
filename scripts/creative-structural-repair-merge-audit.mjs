#!/usr/bin/env node

// Zero-cost regression guard for targeted Creative temporal repairs.
//
// A temporal contract repair is explicitly instructed to return only the keys it
// changes. Scenes and shots are therefore patch structures: returning one failed shot
// must not delete every sibling shot or every other scene. This audit executes the
// actual merge implementation from source and proves the production-blocking failure
// cannot silently return.
//
// No provider, database, wallet or network call is made.

import fs from "node:fs";

const SOURCE_PATH =
  "lib/creative/director/runtime/mergeCreativeRepairedPlan.js";

const source = fs.readFileSync(SOURCE_PATH, "utf8");
const executableSource = source
  .replace(
    "export function mergeCreativeRepairedPlan",
    "function mergeCreativeRepairedPlan",
  )
  .replace(
    /export default mergeCreativeRepairedPlan;?\s*$/m,
    "",
  );

const { mergeCreativeRepairedPlan } = new Function(
  `${executableSource}\nreturn { mergeCreativeRepairedPlan };`,
)();

const failures = [];
const passes = [];

function check(name, condition, detail = "") {
  if (condition) passes.push(name);
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

const base = {
  scenes: [
    {
      id: "scene-1",
      title: "Churchill entrance welcome",
      objective: "Welcome the guest into the venue",
      shots: [
        {
          id: "scene-1-shot-1",
          title: "Establish entrance",
          action: "The entrance holds before staff step into the welcome.",
          camera: {
            framing: "wide entrance composition",
            angle: "eye level",
          },
          frame_plan: {
            opening_frame: "The entrance and real Churchill signage establish place.",
          },
        },
        {
          id: "scene-1-shot-2",
          title: "Staff welcome guest",
          action: "Staff opens the door and welcomes the arriving guest.",
          camera: {},
          frame_plan: {},
          negative_constraints: ["Do not change the staff identity."],
        },
      ],
    },
    {
      id: "scene-2",
      title: "Second scene must survive",
      objective: "Prove an unrelated scene is not deleted by a targeted repair.",
      shots: [
        {
          id: "scene-2-shot-1",
          title: "Untouched second-scene shot",
          action: "This shot is already valid and must remain untouched.",
        },
      ],
    },
  ],
  deliverables: [
    { code: "D1", type: "VIDEO" },
    { code: "D2", type: "CUTDOWN" },
  ],
  creative_review: {
    repair_before_production: ["repair the incomplete shot"],
  },
};

const repaired = mergeCreativeRepairedPlan(base, {
  scenes: [
    {
      id: "scene-1",
      shots: [
        {
          id: "scene-1-shot-2",
          camera: {
            framing: "medium two-shot at the doorway",
            angle: "eye level with the arriving guest",
          },
          frame_plan: {
            opening_frame:
              "The guest enters foreground as staff opens the Churchill door behind.",
            progression:
              "Staff makes eye contact, opens the door fully and gestures the guest inside.",
            closing_frame:
              "Guest crosses the threshold with staff holding the welcome naturally.",
          },
        },
      ],
    },
  ],
});

check(
  "targeted repair preserves unmentioned scenes",
  repaired.scenes.length === 2 && repaired.scenes[1]?.id === "scene-2",
  `scene_count=${repaired.scenes.length}`,
);

check(
  "targeted repair preserves good sibling shots",
  repaired.scenes[0]?.shots?.length === 2 &&
    repaired.scenes[0]?.shots?.[0]?.id === "scene-1-shot-1",
  `shot_count=${repaired.scenes[0]?.shots?.length}`,
);

check(
  "targeted repair keeps the failed shot's existing direction",
  repaired.scenes[0]?.shots?.[1]?.action ===
    "Staff opens the door and welcomes the arriving guest.",
);

check(
  "targeted camera repair lands on the identified shot",
  repaired.scenes[0]?.shots?.[1]?.camera?.framing ===
    "medium two-shot at the doorway",
);

check(
  "targeted frame-plan repair lands on the identified shot",
  repaired.scenes[0]?.shots?.[1]?.frame_plan?.progression?.includes(
    "opens the door fully",
  ),
);

check(
  "untouched nested safety direction survives the repair",
  repaired.scenes[0]?.shots?.[1]?.negative_constraints?.[0] ===
    "Do not change the staff identity.",
);

// Preserve the intentional historical semantics outside structural scene/shot patches.
const truncated = mergeCreativeRepairedPlan(base, {
  deliverables: [{ code: "D1" }],
});
check(
  "non-structural arrays may still intentionally truncate",
  truncated.deliverables.length === 1,
  `deliverable_count=${truncated.deliverables.length}`,
);

const cleared = mergeCreativeRepairedPlan(base, {
  creative_review: { repair_before_production: [] },
});
check(
  "an explicit empty array still clears",
  cleared.creative_review.repair_before_production.length === 0,
);

check(
  "the implementation explicitly protects scenes and shots",
  source.includes(
    'const STRUCTURAL_PATCH_ARRAY_KEYS = new Set(["scenes", "shots"]);',
  ),
);

console.log("============================================================");
console.log("CREATIVE STRUCTURAL REPAIR MERGE AUDIT");
console.log("============================================================");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("DATABASE_READS_EXECUTED=NO");
console.log(`CHECKS_PASSED=${passes.length}`);
console.log(`CHECKS_FAILED=${failures.length}`);

for (const failure of failures) {
  console.log(`FAILURE=${failure}`);
}

if (failures.length) {
  console.log("CREATIVE_STRUCTURAL_REPAIR_MERGE_AUDIT=FAILED");
  process.exitCode = 1;
} else {
  console.log("CREATIVE_STRUCTURAL_REPAIR_MERGE_AUDIT=PASSED");
}
