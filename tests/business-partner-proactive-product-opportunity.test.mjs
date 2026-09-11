import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const opportunity = await readFile("lib/platform/capabilities/createBusinessPartnerProductOpportunityCapability.js", "utf8");
const attention = await readFile("lib/operator/runtime/OperatorAnticipatoryRuntime.js", "utf8");
const autonomousEvidence = await readFile("lib/operator/runtime/OperatorAutonomousEvidenceRuntime.js", "utf8");
const legacy = await readFile("lib/operator/runtime/OperatorTurnRuntimeLegacy.js", "utf8");
const platform = await readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");
const governed = await readFile("lib/operator/runtime/OperatorTurnRuntimeGoverned.js", "utf8");

test("repeated cross-organization friction becomes proposal-only product opportunity evidence", () => {
  assert.match(opportunity, /MIN_OCCURRENCES = 3/);
  assert.match(opportunity, /MIN_DISTINCT_ORGANIZATIONS = 2/);
  assert.match(opportunity, /MAX_OPPORTUNITIES = 1/);
  assert.match(opportunity, /ACTIONABLE_FRICTION/);
  assert.match(opportunity, /platform\.product_engineering_portfolio\.execute/);
  assert.match(opportunity, /friction_alone_cannot_prove_product_defect: true/);
  assert.match(opportunity, /automatic_engineering_started: false/);
  assert.match(opportunity, /authorization_effect: "NONE"/);
});

test("product opportunity goal is server built and requires fresh source plus market proof", () => {
  assert.match(opportunity, /export function buildBusinessPartnerProductOpportunityGoal/);
  assert.match(opportunity, /Reassess actual current GitHub main before editing/);
  assert.match(opportunity, /aggregate only as prioritization evidence, not proof of a defect/);
  assert.match(opportunity, /current professional standards and market evidence/);
  assert.match(opportunity, /measurable Avantiqo advantage rather than feature parity/);
});

test("Attention always includes the product opportunity read and never lets the model author its engineering payload", () => {
  assert.match(attention, /PRODUCT_OPPORTUNITY_KEY = "platform\.business_partner_product_opportunities\.read"/);
  assert.match(attention, /productOpportunity \? \[productOpportunity\] : \[\]/);
  assert.match(attention, /buildBusinessPartnerProductOpportunityGoal\(pattern\)/);
  assert.match(attention, /payload_source: "SERVER_AUTHENTICATED_PRODUCT_FRICTION_PATTERN"/);
  assert.match(attention, /model_authored_payload: false/);
  assert.match(attention, /Number\(pattern\.occurrences \|\| 0\) >= 3/);
  assert.match(attention, /Number\(pattern\.distinct_organization_count \|\| 0\) >= 2/);
});

test("autonomous Business Partner watch also receives threshold-qualified product opportunity evidence", () => {
  assert.match(autonomousEvidence, /PRODUCT_OPPORTUNITY_KEY = "platform\.business_partner_product_opportunities\.read"/);
  assert.match(autonomousEvidence, /productOpportunity \? \[productOpportunity\] : \[\]/);
  assert.match(autonomousEvidence, /autonomous_manifest_ranked_domain_diverse_v1/);
});

test("Attention recommendation carries the exact server payload into the existing governed proposal lifecycle", () => {
  assert.match(legacy, /payload: object\(recommended\.payload\)/);
  assert.match(governed, /agreementWithOperatorRecommendationProposal/);
  assert.match(governed, /recommendation_authorization_effect: "NONE"/);
  assert.match(governed, /pending_execution_created: false/);
  assert.match(governed, /separate_selection_required: true/);
  assert.match(governed, /separate_execution_instruction_required: true/);
});

test("product opportunity read is registered as a normal Platform capability", () => {
  assert.match(platform, /createBusinessPartnerProductOpportunityCapability/);
  assert.match(platform, /business_partner_product_opportunities: \{ read:/);
});
