import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("synthetic governed path uses the defined pre-calibration pending control decision", () => {
  const source = fs.readFileSync(
    "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js",
    "utf8",
  );

  assert.match(
    source,
    /preparedAttachmentReflex \|\| preCalibrationPendingControlDecision \|\| deterministicExactAction/,
  );
  assert.doesNotMatch(
    source,
    /preparedAttachmentReflex \|\| pendingControlDecision \|\| deterministicExactAction/,
  );
});
