import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  OPERATOR_MECHANISM_RESEARCH_SPEND_GUARD_CONTRACT,
  requireOperatorMechanismResearchSpendApproval,
} from "../lib/platform/research/runtime/OperatorMechanismResearchSpendGuard.js";

const APPROVAL_ENV = "AVANTIQO_MECHANISM_RESEARCH_SPEND_APPROVED";
const mechanismSource = fs.readFileSync(
  new URL("../lib/platform/research/runtime/OperatorMechanismResearchRuntime.js", import.meta.url),
  "utf8",
);

function withApproval(value, callback) {
  const previous = process.env[APPROVAL_ENV];
  if (value == null) delete process.env[APPROVAL_ENV];
  else process.env[APPROVAL_ENV] = value;
  try {
    return callback();
  } finally {
    if (previous == null) delete process.env[APPROVAL_ENV];
    else process.env[APPROVAL_ENV] = previous;
  }
}

test("evidence research does not require paid synthesis approval", () => {
  const result = withApproval(null, () =>
    requireOperatorMechanismResearchSpendApproval("evidence"),
  );
  assert.equal(result.contract, OPERATOR_MECHANISM_RESEARCH_SPEND_GUARD_CONTRACT);
  assert.equal(result.spend_approval_required, false);
  assert.equal(result.spend_approved, false);
  assert.equal(result.authorization_effect, "NONE");
  assert.equal(result.mutation_authority, "NONE");
});

test("mechanism and invention synthesis fail closed without explicit spend approval", () => {
  for (const mode of ["mechanism", "invention"]) {
    assert.throws(
      () => withApproval(null, () => requireOperatorMechanismResearchSpendApproval(mode)),
      /MECHANISM_RESEARCH_SYNTHESIS_SPEND_APPROVAL_REQUIRED/,
    );
  }
});

test("explicit synthesis spend approval grants spend only and never mutation authority", () => {
  for (const mode of ["mechanism", "invention"]) {
    const result = withApproval("YES", () =>
      requireOperatorMechanismResearchSpendApproval(mode),
    );
    assert.equal(result.spend_approval_required, true);
    assert.equal(result.spend_approved, true);
    assert.equal(result.authorization_effect, "SYNTHESIS_SPEND_ONLY");
    assert.equal(result.mutation_authority, "NONE");
  }
});

test("mechanism runtime enforces spend approval before owned Deep synthesis", () => {
  assert.match(mechanismSource, /requireOperatorMechanismResearchSpendApproval/);
  const approvalIndex = mechanismSource.indexOf(
    "const spendAuthorization = requireOperatorMechanismResearchSpendApproval(mode)",
  );
  const synthesisIndex = mechanismSource.indexOf(
    "AvantiqoStructuredIntelligenceSupervisorRuntime.run({",
  );
  assert.ok(approvalIndex >= 0);
  assert.ok(synthesisIndex > approvalIndex);
  assert.match(mechanismSource, /allow_mutating_tools:\s*false/);
  assert.match(mechanismSource, /synthesis_spend_authorization_effect/);
  assert.match(mechanismSource, /authorization_effect:\s*"NONE"/);
  assert.match(mechanismSource, /execution_effect:\s*"NONE"/);
});
