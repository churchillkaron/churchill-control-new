import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js", "utf8");
const mission = fs.readFileSync("lib/platform/capabilities/createOperatorBindingAwareMissionCapability.js", "utf8");
const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const selfHealing = fs.readFileSync("lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js", "utf8");
const assessment = fs.readFileSync("lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentRuntime.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260911113000_business_partner_product_evidence.sql", "utf8");

test("Business Partner product evidence is structural and de-identified", () => {
  assert.match(runtime, /source_organization_fingerprint/);
  assert.match(runtime, /customer_private_content_included: false/);
  assert.match(runtime, /customer_identifiers_included: false/);
  assert.match(runtime, /raw_mission_text_included: false/);
  assert.match(runtime, /raw_payload_included: false/);
  assert.match(runtime, /raw_output_included: false/);
  assert.match(runtime, /authorization_effect: "NONE"/);
  assert.match(runtime, /timingSafeEqual/);
  assert.match(runtime, /evidence_mac/);
  assert.doesNotMatch(migration, /conversation_id|party_id|entity_id|source_organization_id/i);
});

test("mission lifecycle records completion blockers waits verification and gates", () => {
  for (const marker of ["COMPLETED", "PRODUCT_OR_RUNTIME_BLOCKER", "VERIFICATION_FRICTION", "WAITING_EXTERNAL", "APPROVAL_GATE", "CONFIRMATION_GATE"]) {
    assert.match(runtime, new RegExp(marker));
  }
  assert.match(mission, /recordBusinessPartnerMissionProductEvidence/);
  assert.match(mission, /productEvidenceObservationToken/);
});

test("explicit mission cancellation becomes non-authorizing abandonment evidence", () => {
  assert.match(runtime, /HUMAN_ABANDONMENT/);
  assert.match(core, /recordBusinessPartnerCancellationProductEvidence/);
  assert.match(core, /cancellingMission && activeRun/);
});

test("self healing contributes separate repair evidence without claiming business success", () => {
  assert.match(runtime, /PRODUCT_DEFECT_REPAIR/);
  assert.match(runtime, /REPAIR_ATTEMPTED/);
  assert.match(runtime, /REPAIR_VERIFIED/);
  assert.match(runtime, /REPAIR_RELEASED/);
  assert.match(selfHealing, /recordBusinessPartnerRepairProductEvidence/);
  assert.match(runtime, /businessEffectVerified: false/);
});

test("Product Intelligence sees only aggregate friction and it has no product authority", () => {
  assert.match(runtime, /distinct_organization_count/);
  assert.match(runtime, /STRUCTURAL_AGGREGATES_ONLY/);
  assert.match(runtime, /organization_ids_included: false/);
  assert.match(runtime, /product_authority: "NONE"/);
  assert.match(runtime, /automatic_engineering_authority: false/);
  assert.match(runtime, /item\.occurrences >= 3 && item\.distinct_organization_count >= 2/);
  assert.match(runtime, /single_organization_cannot_steer_product_priority: true/);
  assert.match(assessment, /business_partner_product_evidence/);
  assert.match(assessment, /prioritize among source-proven gaps/);
  assert.match(assessment, /not current-product truth/);
  assert.match(assessment, /business_partner_product_evidence_authorization_effect: "NONE"/);
});

test("product evidence table is service-role-only and duplicate-safe", () => {
  assert.match(migration, /unique \(learning_organization_id, event_fingerprint\)/i);
  assert.match(migration, /evidence_mac text not null/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all .* anon, authenticated/i);
  assert.match(migration, /Contains no raw mission text, payload, output, customer identifiers or execution authority/i);
});
