import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { assessOperatorRepairLiveReadEvidence } from "../lib/operator/runtime/OperatorRepairLiveReadEvidenceRuntime.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");

function supervised(key = "finance.customer_invoice.read") {
  return {
    phases: {
      reason_act_observe: {
        transcript: [{ tool_calls: [{ name: "operator_live_read", outcome: "succeeded", invocation_identity: { capability_key: key } }] }],
      },
    },
  };
}

function failure(payload = { invoice_id: "inv-a" }) {
  return {
    execution: { capability: { key: "finance.customer_invoice.create" } },
    agreement_state: { business_partner_recovery: { payload } },
  };
}

function receipt({ invoice = "inv-a", organization = "org-a", entity = "entity-a", key = "finance.customer_invoice.read" } = {}) {
  return {
    capability_key: key,
    organization_id: organization,
    entity_id: entity,
    period_id: "period-a",
    party_id: "party-a",
    status: "completed",
    stable_business_identity_fingerprints: [hash(`invoice_id:${invoice}`)],
  };
}

const scope = { organization_id: "org-a", entity_id: "entity-a", period_id: "period-a", party_id: "party-a" };

test("same capability but wrong business record cannot confirm a defect", () => {
  const evidence = assessOperatorRepairLiveReadEvidence(supervised(), failure(), [receipt({ invoice: "inv-b" })], scope);
  assert.equal(evidence.relevant_observed, true);
  assert.equal(evidence.identity_required, true);
  assert.equal(evidence.identity_matched, false);
});

test("same capability and exact business record identity confirms relevant read evidence", () => {
  const evidence = assessOperatorRepairLiveReadEvidence(supervised(), failure(), [receipt()], scope);
  assert.equal(evidence.identity_required, true);
  assert.equal(evidence.identity_matched, true);
  assert.equal(evidence.identity_matched_receipt_count, 1);
});

test("matching record from another organization or entity is rejected", () => {
  const wrongOrg = assessOperatorRepairLiveReadEvidence(supervised(), failure(), [receipt({ organization: "org-b" })], scope);
  const wrongEntity = assessOperatorRepairLiveReadEvidence(supervised(), failure(), [receipt({ entity: "entity-b" })], scope);
  assert.equal(wrongOrg.identity_matched, false);
  assert.equal(wrongEntity.identity_matched, false);
});

test("identity-free failed actions retain strict capability-and-scope fallback", () => {
  const evidence = assessOperatorRepairLiveReadEvidence(supervised(), failure({}), [receipt()], scope);
  assert.equal(evidence.identity_required, false);
  assert.equal(evidence.identity_matched, true);
});
