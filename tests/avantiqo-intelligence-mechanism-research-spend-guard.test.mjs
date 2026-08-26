import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  requireOperatorMechanismResearchSpendApproval,
} from "../lib/platform/research/runtime/OperatorMechanismResearchSpendGuard.js";

const mechanismSource = fs.readFileSync(
  new URL("../lib/platform/research/runtime/OperatorMechanismResearchRuntime.js", import.meta.url),
  "utf8",
);

function withSpendApproval(value, fn) {
  const previous = process.env.AVANTIQO_MECHANISM_RESEARCH_SPEND_APPROVED;
  if (value === undefined) {
    delete process.env.AVANTIQO_MECHANISM_RESEARCH_SPEND_APPROVED;
  } else {
    process.env.AVANTIQO_MECHANISM_RESEARCH_SPEND_APPROVED = value;
  }
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.AVANTIQO_MECHANISM_RESEARCH_SPEND_APPROVED;
    } else {
      process.env.AVANTIQO_MECHANISM_RESEARCH_SPEND_APPROVED = previous;
    }
  }
}

test("evidence-only research does not require synthesis spend approval", () => {
  withSpendApproval(undefined, () => {
    const approval = requireOperatorMechanismResearchSpendApproval("evidence");
    assert.equal(approval.spend_approval_required, false);
    assert.equal(approval.spend_approved, false);
    assert.equal(approval.authorization_effect, "NONE");
    assert.equal(approval.mutation_authority, "NONE");
  });
});

test("mechanism and invention synthesis fail closed without explicit spend approval", () => {
  withSpendApproval(undefined, () => {
    assert.throws(
      () => requireOperatorMechanismResearchSpendApproval("mechanism"),
      /MECHANISM_RESEARCH_SYNTHESIS_SPEND_APPROVAL_REQUIRED/,
    );
    assert.throws(
      () => requireOperatorMechanismResearchSpendApproval("invention"),
      /MECHANISM_RESEARCH_SYNTHESIS_SPEND_APPROVAL_REQUIRED/,
    );
  });
});

test("explicit approval authorizes synthesis spend only and never business mutation", () => {
  withSpendApproval("YES", () => {
    const mechanism = requireOperatorMechanismResearchSpendApproval("mechanism");
    const invention = requireOperatorMechanismResearchSpendApproval("invention");
    for (const approval of [mechanism, invention]) {
      assert.equal(approval.spend_approval_required, true);
      assert.equal(approval.spend_approved, true);
      assert.equal(approval.authorization_effect, "SYNTHESIS_SPEND_ONLY");
      assert.equal(approval.mutation_authority, "NONE");
    }
  });
});

test("mechanism research checks spend authorization before the Deep supervisor call", () => {
  assert.match(mechanismSource, /requireOperatorMechanismResearchSpendApproval\(mode\)/);
  assert.match(mechanismSource, /AvantiqoStructuredIntelligenceSupervisorRuntime\.run/);
  const guardIndex = mechanismSource.indexOf(
    "requireOperatorMechanismResearchSpendApproval(mode)",
  );
  const supervisorIndex = mechanismSource.indexOf(
    "AvantiqoStructuredIntelligenceSupervisorRuntime.run",
  );
  assert.ok(guardIndex >= 0);
  assert.ok(supervisorIndex > guardIndex);
  assert.match(mechanismSource, /mode:\s*"deep"/);
  assert.match(mechanismSource, /allow_mutating_tools:\s*false/);
});
