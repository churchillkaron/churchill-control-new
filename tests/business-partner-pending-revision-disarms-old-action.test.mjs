import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const interpreter = fs.readFileSync("lib/operator/runtime/OperatorPendingActionSemanticInterpreter.js", "utf8");
const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");

test("pending semantic unclear path uses the actual relation envelope and never throws on missing variable", () => {
  assert.match(interpreter, /text\(relationEnvelope\.cq, 700\)/);
  assert.doesNotMatch(interpreter, /text\(envelope\.cq/);
});

test("generic semantic revision disarms old pending action before any further routing", () => {
  assert.match(core, /const semanticRevision = text\(pendingSemanticRelation, 40\)\.toLowerCase\(\) === "revise"/);
  const revision = core.indexOf("if (offeredPending && semanticRevision)");
  const responds = core.indexOf("const respondsToPending", revision);
  assert.ok(revision >= 0 && responds > revision);
  assert.match(core.slice(revision, responds), /clearPendingAndSupersedeRun\(agreementState, true\)/);
  assert.match(core.slice(revision, responds), /prior_authorization_reused: false/);
  assert.match(core.slice(revision, responds), /mutation_executed: false/);
  assert.match(core.slice(revision, responds), /PENDING_ACTION_REVISION_REQUIRES_FRESH_GOVERNANCE/);
});
