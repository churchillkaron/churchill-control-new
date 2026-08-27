import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  AVANTIQO_EPISTEMIC_CONFIDENCE_CALIBRATION_CONTRACT,
  calibrateAvantiqoEpistemicConfidence,
} from "../lib/intelligence/runtime/AvantiqoEpistemicConfidenceCalibrationRuntime.mjs";

function baseResult(overrides = {}) {
  return {
    goal_status: "in_progress",
    confidence: 0.99,
    epistemic_state: {
      information_sufficient: true,
      research_status: "not_required",
      live_read_status: "not_required",
      verification_status: "not_required",
      conflict_status: "none",
      unresolved_contradictions: [],
      critical_assumptions: [],
      unresolved_questions: [],
      stop_reason: "not_required",
      gate_violations: [],
      ...overrides,
    },
  };
}

test("confidence calibration exposes canonical contract", () => {
  assert.equal(
    AVANTIQO_EPISTEMIC_CONFIDENCE_CALIBRATION_CONTRACT,
    "AVANTIQO_EPISTEMIC_CONFIDENCE_CALIBRATION_V1",
  );
});

test("unresolved contradictions cap even non-completion confidence", () => {
  const calibrated = calibrateAvantiqoEpistemicConfidence({
    result: baseResult({ unresolved_contradictions: ["Evidence A conflicts with evidence B"] }),
  });
  assert.equal(calibrated.confidence, 0.45);
  assert.equal(calibrated.confidence_calibration.lowered, true);
  assert.equal(calibrated.confidence_calibration.deterministic_ceiling, 0.45);
});

test("required research must be proven before high confidence survives", () => {
  const calibrated = calibrateAvantiqoEpistemicConfidence({
    result: baseResult({
      research_status: "satisfied",
      research_tool_observed: true,
      research_stop_proven: false,
    }),
    route: { requirements: { research_required: true } },
  });
  assert.equal(calibrated.confidence, 0.58);
  assert.ok(
    calibrated.confidence_calibration.reasons.some(
      (reason) => reason.code === "REQUIRED_RESEARCH_NOT_PROVEN",
    ),
  );
});

test("required live read and verification independently constrain confidence", () => {
  const liveRead = calibrateAvantiqoEpistemicConfidence({
    result: baseResult({ live_read_status: "missing", live_read_tool_observed: false }),
    route: { requirements: { live_read_required: true } },
  });
  assert.equal(liveRead.confidence, 0.58);

  const verification = calibrateAvantiqoEpistemicConfidence({
    result: baseResult({ verification_status: "missing", verification_tool_observed: false }),
    route: { requirements: { verification_required: true } },
  });
  assert.equal(verification.confidence, 0.6);
});

test("critical assumptions and unresolved questions prevent false precision", () => {
  const assumptions = calibrateAvantiqoEpistemicConfidence({
    result: baseResult({ critical_assumptions: ["Assumption one", "Assumption two"] }),
  });
  assert.equal(assumptions.confidence, 0.72);

  const questions = calibrateAvantiqoEpistemicConfidence({
    result: baseResult({ unresolved_questions: ["Question one", "Question two"] }),
  });
  assert.equal(questions.confidence, 0.76);
});

test("calibration never increases model confidence", () => {
  const calibrated = calibrateAvantiqoEpistemicConfidence({
    result: {
      ...baseResult(),
      confidence: 0.41,
    },
  });
  assert.equal(calibrated.confidence, 0.41);
  assert.equal(calibrated.confidence_calibration.confidence_never_increased, true);
  assert.equal(calibrated.confidence_calibration.lowered, false);
});

test("clean proven epistemic state preserves the model confidence ceiling", () => {
  const calibrated = calibrateAvantiqoEpistemicConfidence({
    result: {
      ...baseResult({
        research_status: "satisfied",
        research_tool_observed: true,
        research_stop_proven: true,
        live_read_status: "satisfied",
        live_read_tool_observed: true,
        verification_status: "verified",
        verification_tool_observed: true,
      }),
      confidence: 0.88,
    },
    route: {
      requirements: {
        research_required: true,
        live_read_required: true,
        verification_required: true,
      },
    },
  });
  assert.equal(calibrated.confidence, 0.88);
  assert.equal(calibrated.confidence_calibration.deterministic_ceiling, 1);
});

test("supervisor applies completion gate before deterministic confidence calibration", () => {
  const source = fs.readFileSync(
    new URL("../lib/intelligence/runtime/AvantiqoIntelligenceSupervisorRuntime.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /applyAvantiqoEpistemicCompletionGate/);
  assert.match(source, /calibrateAvantiqoEpistemicConfidence/);
  const gateIndex = source.indexOf("const completionGated = applyAvantiqoEpistemicCompletionGate");
  const calibrationIndex = source.indexOf("const calibrated = calibrateAvantiqoEpistemicConfidence");
  assert.ok(gateIndex >= 0);
  assert.ok(calibrationIndex > gateIndex);
});
