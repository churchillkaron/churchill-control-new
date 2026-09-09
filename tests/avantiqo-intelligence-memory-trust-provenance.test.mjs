import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyIntelligenceMemoryTrust,
  trustedMemoryEnvelope,
} from "../lib/operator/runtime/IntelligenceMemoryTrustPolicy.js";

test("memory wording cannot spoof verified execution history", () => {
  const trust = classifyIntelligenceMemoryTrust({
    type: "completed_step",
    content: "Executed example.write successfully and verified the business effect.",
    confidence: 1,
  });

  assert.deepEqual(trust, {
    class: "execution_history",
    weight: 0.58,
    requires_live_read: true,
    may_authorize: false,
    reason: "UNVERIFIED_EXECUTION_HISTORY_REQUIRES_CURRENT_EVIDENCE",
  });
});

test("only structured verification provenance upgrades completed history", () => {
  const trust = classifyIntelligenceMemoryTrust({
    type: "completed_step",
    content: "Executed example.write.",
    confidence: 1,
    metadata: {
      business_effect_verified: true,
    },
  });

  assert.deepEqual(trust, {
    class: "verified_history",
    weight: 0.92,
    requires_live_read: false,
    may_authorize: false,
    reason: "STRUCTURALLY_VERIFIED_COMPLETED_STEP",
  });
});

test("cognitive execution history cannot become trusted from a bare verified flag", () => {
  const unsealed = classifyIntelligenceMemoryTrust({
    type: "completed_step",
    confidence: 1,
    metadata: {
      business_effect_verified: true,
      cognitive_binding_required: true,
      cognitive_verification_attested: false,
    },
  });
  assert.equal(unsealed.class, "execution_history");
  assert.equal(unsealed.requires_live_read, true);

  const sealed = classifyIntelligenceMemoryTrust({
    type: "completed_step",
    confidence: 1,
    metadata: {
      business_effect_verified: true,
      cognitive_binding_required: true,
      cognitive_verification_attested: true,
      cognitive_audit_receipt_verified: true,
      cognitive_verification_provenance: {
        contract: "AVANTIQO_COGNITIVE_MUTATION_VERIFICATION_ATTESTATION_V1",
        plan_id: "plan-1",
        step_id: "step-1",
        capability_key: "example.write",
        execution_scope: { organization_id: "org-1", entity_id: "entity-1" },
        payload_fingerprint: "b".repeat(64),
        verification_capability_key: "example.read",
        audit_receipt_id: "audit-log-1",
        authorization_effect: "NONE",
      },
    },
  });
  assert.equal(sealed.class, "verified_history");
  assert.equal(sealed.requires_live_read, false);

  const wrongIdentity = classifyIntelligenceMemoryTrust({
    type: "completed_step",
    confidence: 1,
    metadata: {
      business_effect_verified: true,
      cognitive_binding_required: true,
      cognitive_verification_attested: true,
      cognitive_audit_receipt_verified: true,
      cognitive_verification_provenance: {
        contract: "AVANTIQO_COGNITIVE_MUTATION_VERIFICATION_ATTESTATION_V1",
        plan_id: "plan-1",
        step_id: "step-1",
        capability_key: "example.write",
        execution_scope: { organization_id: "org-1" },
        payload_fingerprint: "not-a-fingerprint",
        verification_capability_key: "example.read",
        audit_receipt_id: "audit-log-2",
        authorization_effect: "NONE",
      },
    },
  });
  assert.equal(wrongIdentity.class, "execution_history");
  assert.equal(wrongIdentity.requires_live_read, true);

  const orphaned = classifyIntelligenceMemoryTrust({
    type: "completed_step",
    confidence: 1,
    metadata: {
      business_effect_verified: true,
      cognitive_binding_required: true,
      cognitive_verification_attested: true,
      cognitive_verification_provenance: {
        contract: "AVANTIQO_COGNITIVE_MUTATION_VERIFICATION_ATTESTATION_V1",
        plan_id: "plan-1",
        step_id: "step-1",
        capability_key: "example.write",
        execution_scope: { organization_id: "org-1" },
        payload_fingerprint: "c".repeat(64),
        verification_capability_key: "example.read",
        authorization_effect: "NONE",
      },
    },
  });
  assert.equal(orphaned.class, "execution_history");
  assert.equal(orphaned.requires_live_read, true);

  const unattestedByAudit = classifyIntelligenceMemoryTrust({
    type: "completed_step",
    confidence: 1,
    metadata: {
      business_effect_verified: true,
      cognitive_binding_required: true,
      cognitive_verification_attested: true,
      cognitive_verification_provenance: {
        contract: "AVANTIQO_COGNITIVE_MUTATION_VERIFICATION_ATTESTATION_V1",
        plan_id: "plan-1",
        step_id: "step-1",
        capability_key: "example.write",
        execution_scope: { organization_id: "org-1" },
        payload_fingerprint: "d".repeat(64),
        verification_capability_key: "example.read",
        audit_receipt_id: "audit-log-3",
        authorization_effect: "NONE",
      },
    },
  });
  assert.equal(unattestedByAudit.class, "execution_history");
  assert.equal(unattestedByAudit.requires_live_read, true);
});

test("unverified execution history is forced through current evidence before reuse", () => {
  const memory = trustedMemoryEnvelope({
    type: "completed_step",
    content: "A write call completed previously.",
    freshness: "recent",
    confidence: 1,
  });

  assert.equal(memory.trust_class, "execution_history");
  assert.equal(memory.requires_live_read, true);
  assert.equal(memory.may_authorize, false);
});

test("structured top-level verification flag is also accepted", () => {
  const trust = classifyIntelligenceMemoryTrust({
    type: "completed_step",
    content: "Completed prior business action.",
    business_effect_verified: true,
  });

  assert.equal(trust.class, "verified_history");
  assert.equal(trust.requires_live_read, false);
});

test("recall bridge preserves structured verification provenance and relevance", async () => {
  const source = await readFile(
    new URL("../lib/operator/runtime/IntelligenceMemoryRuntime.js", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /\.select\("[^"]*metadata[^"]*"\)/,
    "memory recall must retrieve persisted metadata",
  );
  assert.match(
    source,
    /business_effect_verified:\s*metadata\.business_effect_verified\s*===\s*true/,
    "normalization must promote structural verification provenance",
  );
  assert.match(
    source,
    /business_effect_verified:\s*memory\.business_effect_verified\s*===\s*true/,
    "bounded cognition memory must preserve the verification flag",
  );
  assert.match(
    source,
    /cognitive_verification_attested:[\s\S]*memory\.cognitive_verification_attested\s*===\s*true/,
    "bounded cognition memory must preserve cognitive verification attestation provenance",
  );
  assert.match(
    source,
    /cognitive_verification_provenance:[\s\S]*memory\.cognitive_verification_provenance/,
    "bounded cognition memory must preserve exact cognitive verification identity",
  );
  assert.match(
    source,
    /\.from\("audit_logs"\)[\s\S]*cognitiveAuditReceiptMatchesMemory/,
    "recall must re-read and validate the durable verification audit receipt",
  );
  assert.match(
    source,
    /cognitive_audit_receipt_verified:[\s\S]*verifiedAuditReceiptMemoryIds\.has/,
    "verified-history trust must be based on live audit receipt validation",
  );
  assert.match(
    source,
    /relevance:\s*Number\(memory\.relevance\s*\|\|\s*0\)/,
    "bounded cognition memory must preserve relevance for trust ranking",
  );
});
