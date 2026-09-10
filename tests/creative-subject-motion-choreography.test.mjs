import assert from "node:assert/strict";
import test from "node:test";

import { CreativeSubjectMotionChoreographyRuntime } from "../lib/creative/quality/runtime/CreativeSubjectMotionChoreographyRuntime.js";

function movingShot(overrides = {}) {
  return {
    action: "Heavy helicopter approaches the offshore platform.",
    frame_plan: { progression: "Helicopter advances continuously toward the helideck approach corridor." },
    subject_motion_choreography: {
      required: true,
      start_state: "Helicopter is airborne over open sea, nose aligned toward the platform approach corridor.",
      path: "Continuous left-to-right shallow approach over open water, remaining outside the platform structure until the helideck corridor.",
      speed_profile: "Controlled deceleration from cruise approach speed into a stabilized low-speed approach.",
      screen_direction: "left-to-right",
      clearance_and_contact_constraints: ["aircraft remains clear of crane, deck structures and platform superstructure"],
      end_state: "Helicopter remains airborne just outside the helideck approach boundary in stable orientation.",
    },
    ...overrides,
  };
}

test("continuous physically authored subject trajectory passes", () => {
  assert.equal(CreativeSubjectMotionChoreographyRuntime.evaluate(movingShot()).passed, true);
});
test("subject cannot spawn or emerge through world geometry", () => {
  const result = CreativeSubjectMotionChoreographyRuntime.evaluate(movingShot({
    subject_motion_choreography: {
      ...movingShot().subject_motion_choreography,
      path: "Helicopter appears from inside the offshore platform and then moves left-to-right into open air.",
    },
  }));
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("SHOT_SUBJECT_MOTION_IMPOSSIBLE_EMERGENCE"));
});

test("screen direction cannot contradict physical path", () => {
  const result = CreativeSubjectMotionChoreographyRuntime.evaluate(movingShot({
    subject_motion_choreography: {
      ...movingShot().subject_motion_choreography,
      path: "Continuous right-to-left approach over open water with stable heading and no reversal.",
      screen_direction: "left-to-right",
    },
  }));
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("SHOT_SUBJECT_MOTION_DIRECTION_CONTRADICTION"));
});

test("moving subjects fail closed when choreography is missing", () => {
  const result = CreativeSubjectMotionChoreographyRuntime.evaluate({
    action: "Helicopter approaches the rig.",
    frame_plan: { progression: "Helicopter moves toward the platform." },
  });
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("SHOT_SUBJECT_MOTION_PATH_REQUIRED"));
  assert.ok(result.failures.includes("SHOT_SUBJECT_MOTION_CLEARANCE_CONSTRAINTS_REQUIRED"));
});
