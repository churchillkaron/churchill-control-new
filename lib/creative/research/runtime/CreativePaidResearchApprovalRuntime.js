import { randomUUID } from "node:crypto";

import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { resolveProvider } from "@/lib/platform/service-runtime/providers/ProviderResolver";
import { PricingRuntime } from "@/lib/platform/service-runtime/pricing/PricingRuntime";
import { resolveServiceCapabilities } from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";
import { resolvePrimaryExecutionCapability } from "@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver";

const RESEARCH_SERVICE_ID = "ai.reasoning.execute";
const APPROVAL_MINUTES = 30;
const APPROVAL_CONTRACT = "CREATIVE_RESEARCH_BUDGET_APPROVAL_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function amountText(value) {
  const parsed = number(value);
  if (parsed === null) return "0";
  return parsed.toFixed(6).replace(/\.?0+$/, "");
}

function reusableApproval(project = {}) {
  const approval = object(project.metadata?.paid_research_approval);
  const approvedAt = Date.parse(text(approval.approved_at));
  const expiresAt = Date.parse(text(approval.expires_at));
  const now = Date.now();
  const identity = text(project.metadata?.command_identity);

  return approval.approved === true &&
    text(approval.provider) &&
    text(approval.pricing_id) &&
    number(approval.maximum_customer_price) > 0 &&
    Number.isFinite(approvedAt) &&
    Number.isFinite(expiresAt) &&
    approvedAt <= now &&
    expiresAt > now &&
    (!text(approval.command_identity) || text(approval.command_identity) === identity)
    ? approval
    : null;
}

async function resolveContext({ organization_id, creative_mission_id, creative_project_id }) {
  const mission = await CreativeMissionRuntime.get(creative_mission_id);
  const project = await CreativeProjectRuntime.get(creative_project_id);
  if (!mission || text(mission.organization_id) !== text(organization_id)) {
    throw new Error("CREATIVE_MISSION_NOT_FOUND");
  }
  if (!project || text(project.organization_id) !== text(organization_id)) {
    throw new Error("CREATIVE_PROJECT_NOT_FOUND");
  }
  if (text(project.creative_mission_id) && text(project.creative_mission_id) !== text(mission.id)) {
    throw new Error("CREATIVE_PROJECT_MISSION_MISMATCH");
  }
  return { mission, project };
}

async function estimateResearch({ organization_id }) {
  const organizationService = await OrganizationServiceRuntime.get({
    organization_id,
    service_id: RESEARCH_SERVICE_ID,
  });
  if (!organizationService) {
    throw new Error(`Service ${RESEARCH_SERVICE_ID} is not enabled for organization`);
  }

  const service = resolveServiceCapabilities(RESEARCH_SERVICE_ID);
  const capability = resolvePrimaryExecutionCapability(service?.capabilities || []);
  if (!capability) throw new Error(`No execution capability found for ${RESEARCH_SERVICE_ID}`);

  const selected = await resolveProvider({
    organization_id,
    capability,
    preferredProvider: null,
    country: null,
    currency: null,
    policy: organizationService.provider_policy || {},
  });
  if (!selected?.pricing_id) throw new Error("CREATIVE_RESEARCH_PRICING_ID_REQUIRED");
  const pricing = await PricingRuntime.resolveById({
    pricing_id: selected.pricing_id,
    currency: selected.currency || null,
    usage: { quantity: 1 },
  });
  const maximumCustomerPrice = number(pricing.customer_price);
  if (maximumCustomerPrice === null || maximumCustomerPrice <= 0) {
    throw new Error("CREATIVE_RESEARCH_PRICE_INVALID");
  }

  return {
    capability,
    provider: selected.provider,
    model: selected.model || null,
    pricing_id: selected.pricing_id,
    maximum_customer_price: maximumCustomerPrice,
    supplier_cost_estimate: number(pricing.supplier_cost),
    currency: text(pricing.currency).toUpperCase(),
    estimated_input_tokens: number(pricing.input_tokens),
    estimated_output_tokens: number(pricing.output_tokens),
    pricing_estimated: pricing.estimated === true,
  };
}

function payload({ mission, project, estimate, approval = null }) {
  return {
    success: Boolean(approval),
    approval_contract: APPROVAL_CONTRACT,
    status: approval ? "RESEARCH_APPROVAL_ACTIVE" : "RESEARCH_APPROVAL_REQUIRED",
    error: approval ? null : "CREATIVE_PAID_RESEARCH_APPROVAL_REQUIRED",
    creative_mission_id: mission.id,
    creative_project_id: project.id,
    research: {
      ...estimate,
      approval_phrase: `APPROVE RESEARCH ${amountText(estimate.maximum_customer_price)} ${estimate.currency}`,
      approval_minutes: APPROVAL_MINUTES,
    },
    paid_research_authorized: Boolean(approval),
    media_generation_authorized: false,
    publication_authorized: false,
    existing_approval: approval
      ? {
          id: approval.id || null,
          approved_at: approval.approved_at || null,
          expires_at: approval.expires_at || null,
          status: approval.status || "APPROVED",
        }
      : null,
  };
}

export const CreativePaidResearchApprovalRuntime = {
  async preflight(input = {}) {
    const context = await resolveContext(input);
    const estimate = await estimateResearch(input);
    const approval = reusableApproval(context.project);
    return payload({ ...context, estimate, approval });
  },

  async approve(input = {}) {
    const context = await resolveContext(input);
    const estimate = await estimateResearch(input);
    const existing = reusableApproval(context.project);
    if (existing) return payload({ ...context, estimate, approval: existing });
    const expectedPhrase = `APPROVE RESEARCH ${amountText(estimate.maximum_customer_price)} ${estimate.currency}`;
    if (text(input.approval_phrase) !== expectedPhrase) {
      const error = new Error("CREATIVE_RESEARCH_APPROVAL_PHRASE_MISMATCH");
      error.preflight = payload({ ...context, estimate });
      throw error;
    }

    const approvedAt = new Date();
    const approval = {
      contract: APPROVAL_CONTRACT,
      id: randomUUID(),
      approved: true,
      status: "APPROVED",
      scope: "AUTONOMOUS_COMPANY_MARKET_RESEARCH",
      creative_project_id: context.project.id,
      command_identity: text(context.project.metadata?.command_identity) || null,
      provider: estimate.provider,
      model: estimate.model,
      capability: estimate.capability,
      pricing_id: estimate.pricing_id,
      maximum_calls: 1,
      maximum_customer_price: estimate.maximum_customer_price,
      supplier_cost_estimate: estimate.supplier_cost_estimate,
      currency: estimate.currency,
      estimated_input_tokens: estimate.estimated_input_tokens,
      estimated_output_tokens: estimate.estimated_output_tokens,
      pricing_estimated: estimate.pricing_estimated,
      approved_at: approvedAt.toISOString(),
      expires_at: new Date(approvedAt.getTime() + APPROVAL_MINUTES * 60 * 1000).toISOString(),
      approved_by_user_id: input.approved_by_user_id || null,
      approved_by_staff_account_id: input.approved_by_staff_account_id || null,
      approved_by_email: input.approved_by_email || null,
      media_generation_authorized: false,
      publication_authorized: false,
    };

    const updatedProject = await CreativeProjectRuntime.update(context.project.id, {
      metadata: {
        ...(context.project.metadata || {}),
        paid_research_approval: approval,
      },
    });
    const active = reusableApproval(updatedProject);
    if (!active) throw new Error("CREATIVE_RESEARCH_APPROVAL_PERSISTENCE_FAILED");

    return {
      ...payload({ mission: context.mission, project: updatedProject, estimate, approval: active }),
      status: "RESEARCH_APPROVED",
    };
  },
};
