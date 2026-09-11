import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  readBusinessPartnerProductEvidenceSummary,
} from "@/lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js";

const MIN_OCCURRENCES = 3;
const MIN_DISTINCT_ORGANIZATIONS = 2;
const MAX_OPPORTUNITIES = 1;
const ACTION_KEY = "platform.product_engineering_portfolio.execute";
const ACTIONABLE_FRICTION = new Set([
  "PRODUCT_OR_RUNTIME_BLOCKER",
  "VERIFICATION_FRICTION",
  "HUMAN_ABANDONMENT",
  "PRODUCT_DEFECT_REPAIR",
]);

const text = (value, limit = 1200) => String(value ?? "").trim().slice(0, limit);

function titleFor(pattern) {
  const area = text(pattern.mission_family, 160).replace(/[._:-]+/g, " ");
  return `Repeated Avantiqo friction in ${area}`.slice(0, 160);
}

export function buildBusinessPartnerProductOpportunityGoal(pattern) {
  const failure = pattern.failure_mode_code
    ? ` Failure signal: ${text(pattern.failure_mode_code, 160)}.`
    : "";
  return [
    `Improve the Avantiqo ${text(pattern.mission_family, 160)} workflow where authenticated Business Partner evidence shows repeated ${text(pattern.friction_class, 120)} friction across multiple organizations.${failure}`,
    "Reassess actual current GitHub main before editing; treat the aggregate only as prioritization evidence, not proof of a defect.",
    "Use current professional standards and market evidence where material, identify the actual source-proven weakness, and implement a measurable Avantiqo advantage rather than feature parity.",
    "Preserve canonical domain ownership, organization/entity isolation, permissions, confirmation, approval, verification, and existing release governance.",
  ].join(" ").slice(0, 5000);
}

function opportunity(pattern) {
  return {
    title: titleFor(pattern),
    why_now: `${Number(pattern.occurrences || 0)} authenticated occurrences across ${Number(pattern.distinct_organization_count || 0)} organizations show repeated ${text(pattern.friction_class, 120)} in ${text(pattern.mission_family, 160)}. This is prioritization evidence only; current-main source evidence must prove the engineering gap.`.slice(0, 600),
    evidence_refs: ["business_partner_product_friction"],
    recommended_next_step: "Run one governed Product Engineering portfolio from fresh current-main evidence and current market/professional research.",
    recommended_action: {
      capability_key: ACTION_KEY,
      description: "Investigate and improve this repeated cross-organization Avantiqo workflow friction.",
      payload: { business_goal: buildBusinessPartnerProductOpportunityGoal(pattern) },
      authorization_effect: "NONE",
    },
    product_evidence: {
      mission_family: pattern.mission_family,
      friction_class: pattern.friction_class,
      failure_mode_code: pattern.failure_mode_code || null,
      occurrences: Number(pattern.occurrences || 0),
      distinct_organization_count: Number(pattern.distinct_organization_count || 0),
      recovered_count: Number(pattern.recovered_count || 0),
      verified_success_count: Number(pattern.verified_success_count || 0),
      raw_customer_content_included: false,
      product_authority: "NONE",
    },
  };
}

export function createBusinessPartnerProductOpportunityCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "business_partner_product_opportunities",
    action: "read",
    name: "Business Partner Product Opportunities",
    description: "Read authenticated de-identified cross-organization Business Partner friction aggregates and surface threshold-qualified product-improvement opportunities. This is prioritization evidence only and cannot prove a defect, start engineering, commit, deploy, migrate, or authorize business actions.",
    permissions: [],
    events: [],
    tags: ["platform", "business-partner", "product-intelligence", "proactive", "friction", "read-only", "recommendation"],
    operatorAliases: ["show repeated avantiqo friction", "what product problems are customers repeatedly hitting", "show product improvement opportunities"],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object", additionalProperties: true },
  });

  function authorize({ context }) {
    return Boolean(text(context?.organizationId, 160) && text(context?.metadata?.partyId, 160));
  }

  async function execute() {
    const summary = await readBusinessPartnerProductEvidenceSummary({ days: 30, limit: 100 });
    const patterns = Array.isArray(summary.patterns) ? summary.patterns : [];
    const eligible = patterns
      .filter((pattern) =>
        ACTIONABLE_FRICTION.has(text(pattern?.friction_class, 120)) &&
        Number(pattern?.occurrences || 0) >= MIN_OCCURRENCES &&
        Number(pattern?.distinct_organization_count || 0) >= MIN_DISTINCT_ORGANIZATIONS
      )
      .slice(0, MAX_OPPORTUNITIES)
      .map(opportunity);

    return {
      status: eligible.length ? "PRODUCT_OPPORTUNITIES_AVAILABLE" : "NO_THRESHOLD_QUALIFIED_PRODUCT_OPPORTUNITIES",
      items: eligible,
      evidence: {
        business_partner_product_friction: {
          source_contract: summary.contract || null,
          source_status: summary.status || null,
          authenticated_row_count: Number(summary.authenticated_row_count || 0),
          invalid_evidence_row_count: Number(summary.invalid_evidence_row_count || 0),
          minimum_occurrences: MIN_OCCURRENCES,
          minimum_distinct_organizations: MIN_DISTINCT_ORGANIZATIONS,
          raw_customer_content_included: false,
          customer_identifiers_included: false,
          organization_ids_included: false,
          product_authority: "NONE",
          authorization_effect: "NONE",
        },
      },
      planning: {
        current_main_reassessment_required_before_engineering: true,
        friction_alone_cannot_prove_product_defect: true,
        market_and_professional_research_required_when_material: true,
        recommendation_only: true,
        automatic_engineering_started: false,
        authorization_effect: "NONE",
      },
    };
  }

  return { manifest, authorize, execute };
}

export default createBusinessPartnerProductOpportunityCapability;
