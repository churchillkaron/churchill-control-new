import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  latestCompletedAgreementBusinessAction,
  registeredRevisionIntent,
} from "../lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js";

const understanding = fs.readFileSync(
  "lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js",
  "utf8",
);
const semantic = fs.readFileSync(
  "lib/operator/runtime/OperatorSemanticActionPreparationRuntime.js",
  "utf8",
);

test("semantic understanding carries the latest verified write outside the recent-turn window", () => {
  assert.match(understanding, /function latestVerifiedWriteExecution\(/);
  assert.match(understanding, /latest_verified_write: latestVerifiedWriteExecution\(options\.conversation\)/);
  assert.match(understanding, /durable read-only continuity anchor/);
});

test("durable write revisions cannot be hijacked by stale product context", () => {
  assert.match(understanding, /const durableBusinessRevision =/);
  assert.match(understanding, /route: "governed"/);
  assert.match(understanding, /execution_domain: "business"/);
  assert.match(understanding, /correction_or_revision: true/);
  assert.match(understanding, /goal_relation: "revise"/);
  assert.match(understanding, /requires_mutation: true/);
  assert.match(understanding, /needs_current_evidence: true/);
});

test("semantic action planner falls back to durable conversation execution when project state is empty", () => {
  assert.match(semantic, /function latestConversationExecution\(/);
  assert.match(semantic, /function effectiveLastExecution\(/);
  assert.match(semantic, /return latestConversationExecution\(options\.conversation\)/);
  const matches = semantic.match(/compactLastExecutionTarget\(effectiveLastExecution\(options\)\)/g) || [];
  assert.ok(matches.length >= 2);
});

test("revision continuity remains generic", () => {
  const combined = `${understanding}\n${semantic}`;
  assert.doesNotMatch(combined, /Moonshine|INV-26090003|Trio band|Full band/);
});


test("completed governed business action anchors can defeat stale product-inspection context", () => {
  assert.match(understanding, /function latestCompletedAgreementBusinessAction\(/);
  assert.match(understanding, /function registeredRevisionIntent\(/);
  assert.match(understanding, /latest_completed_business_action:/);
  assert.match(understanding, /Boolean\(registeredRevision\)/);
  assert.match(understanding, /route: "governed"/);
  assert.match(understanding, /execution_domain: "business"/);
  assert.match(understanding, /requires_mutation: true/);
});

test("completed agreement actions remain available when turn execution metadata is absent", () => {
  assert.match(semantic, /function latestAgreementExecution\(/);
  assert.match(semantic, /agreement_autonomous_run/);
  assert.match(semantic, /latestConversationExecution\(options\.conversation\) \|\| latestAgreementExecution\(options\.agreementState\)/);
});


test("natural correction of the last completed business action is recognized without hardcoded customer data", () => {
  const agreementState = {
    autonomous_run: {
      status: "completed",
      updated_at: "2026-09-25T06:34:10.879Z",
      planned_steps: [{
        status: "completed",
        capability_key: "finance.accounts_receivable.CreateCustomerInvoice",
        payload: { invoice_date: "2026-09-28" },
      }],
    },
  };
  const anchor = latestCompletedAgreementBusinessAction(agreementState);
  assert.equal(anchor?.capability_key, "finance.accounts_receivable.CreateCustomerInvoice");
  const revision = registeredRevisionIntent(
    "the last invoice for a customer need to change 7 days back on all 3 dates",
    anchor,
  );
  assert.equal(revision?.key, "finance.accounts_receivable.CorrectCustomerInvoice");
  assert.equal(anchor?.authorization_effect, "NONE");
});

test("read-only invoice language does not become a registered revision", () => {
  const anchor = {
    capability_key: "finance.accounts_receivable.CreateCustomerInvoice",
  };
  assert.equal(registeredRevisionIntent("show the last customer invoice", anchor), null);
  assert.equal(registeredRevisionIntent("how should the invoice workflow work", anchor), null);
});
