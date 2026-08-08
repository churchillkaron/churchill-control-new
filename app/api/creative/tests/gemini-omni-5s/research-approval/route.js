export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  OrganizationServiceRuntime,
} from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import {
  resolveProvider,
} from "@/lib/platform/service-runtime/providers/ProviderResolver";
import {
  PricingRuntime,
} from "@/lib/platform/service-runtime/pricing/PricingRuntime";
import {
  resolveServiceCapabilities,
} from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";
import {
  resolvePrimaryExecutionCapability,
} from "@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TEST_CONTRACT = "GEMINI_OMNI_FULL_STUDIO_5S_SMOKE_V1";
const RESEARCH_SERVICE_ID = "ai.reasoning.execute";
const RESEARCH_APPROVAL_MINUTES = 30;
const RESEARCH_APPROVAL_CONTRACT = "CREATIVE_RESEARCH_BUDGET_APPROVAL_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

async function requireAccess(request) {
  return requireOrganizationAccess({
    organizationId: ORGANIZATION_ID,
    request,
    requiredAnyPermission: [
      "creative.execute",
      "creative.production.run",
      "creative.*",
    ],
  });
}

async function smokeProject() {
  const missions = await CreativeMissionRuntime.list({
    organization_id: ORGANIZATION_ID,
  });
  const mission = missions.find((item) =>
    item.metadata?.test_contract === TEST_CONTRACT &&
    item.status !== "archived"
  ) || null;

  if (!mission) {
    throw new Error("GEMINI_SMOKE_MISSION_REQUIRED");
  }

  const started = await CreativeMissionRuntime.start(mission.id);
  const projectId = started.runtime_context?.creative_project_id;
  if (!projectId) throw new Error("GEMINI_SMOKE_PROJECT_REQUIRED");

  const project = await CreativeProjectRuntime.get(projectId);
  if (!project || text(project.organization_id) !== ORGANIZATION_ID) {
    throw new Error("GEMINI_SMOKE_PROJECT_NOT_FOUND");
  }

  return { mission: started, project };
}

function reusableResearchApproval(project = {}) {
  const approval = object(project.metadata?.paid_research_approval);
  const approvedAt = Date.parse(text(approval.approved_at));
  const expiresAt = Date.parse(text(approval.expires_at));
  const now = Date.now();

  return (
    approval.approved === true &&
    text(approval.provider) &&
    text(approval.pricing_id) &&
    number(approval.maximum_customer_price) > 0 &&
    Number.isFinite(approvedAt) &&
    Number.isFinite(expiresAt) &&
    approvedAt <= now &&
    expiresAt > now
  ) ? approval : null;
}

async function researchEstimate() {
  const organizationService = await OrganizationServiceRuntime.get({
    organization_id: ORGANIZATION_ID,
    service_id: RESEARCH_SERVICE_ID,
  });
  if (!organizationService) {
    throw new Error(`Service ${RESEARCH_SERVICE_ID} is not enabled for organization`);
  }

  const service = resolveServiceCapabilities(RESEARCH_SERVICE_ID);
  const capability = resolvePrimaryExecutionCapability(service?.capabilities || []);
  if (!capability) {
    throw new Error(`No execution capability found for ${RESEARCH_SERVICE_ID}`);
  }

  const selected = await resolveProvider({
    organization_id: ORGANIZATION_ID,
    capability,
    preferredProvider: null,
    country: null,
    currency: null,
    policy: organizationService.provider_policy || {},
  });
  if (!selected?.pricing_id) {
    throw new Error("CREATIVE_RESEARCH_PRICING_ID_REQUIRED");
  }

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
    currency: pricing.currency,
    estimated_input_tokens: number(pricing.input_tokens),
    estimated_output_tokens: number(pricing.output_tokens),
    pricing_estimated: pricing.estimated === true,
  };
}

function approvalPhrase(estimate) {
  return `APPROVE RESEARCH ${amountText(estimate.maximum_customer_price)} ${text(estimate.currency).toUpperCase()}`;
}

function preflightPayload({ mission, project, estimate, existingApproval = null }) {
  const phrase = approvalPhrase(estimate);
  return {
    success: Boolean(existingApproval),
    contract: TEST_CONTRACT,
    approval_contract: RESEARCH_APPROVAL_CONTRACT,
    status: existingApproval ? "RESEARCH_APPROVAL_ACTIVE" : "RESEARCH_APPROVAL_REQUIRED",
    error: existingApproval ? null : "CREATIVE_PAID_RESEARCH_APPROVAL_REQUIRED",
    creative_mission_id: mission.id,
    creative_project_id: project.id,
    research: {
      provider: estimate.provider,
      model: estimate.model,
      capability: estimate.capability,
      pricing_id: estimate.pricing_id,
      maximum_customer_price: estimate.maximum_customer_price,
      currency: estimate.currency,
      estimated_input_tokens: estimate.estimated_input_tokens,
      estimated_output_tokens: estimate.estimated_output_tokens,
      pricing_estimated: estimate.pricing_estimated,
      approval_phrase: phrase,
      approval_minutes: RESEARCH_APPROVAL_MINUTES,
    },
    paid_research_authorized: Boolean(existingApproval),
    media_generation_authorized: false,
    publication_authorized: false,
    existing_approval: existingApproval
      ? {
          id: existingApproval.id || null,
          approved_at: existingApproval.approved_at || null,
          expires_at: existingApproval.expires_at || null,
          status: existingApproval.status || "APPROVED",
        }
      : null,
  };
}

export async function GET(request) {
  try {
    const access = await requireAccess(request);
    if (!access.success) return json(access, access.status);
    if (!access.access?.staffAccountId) {
      return json({
        success: false,
        error: "Authenticated staff account required",
      }, 403);
    }

    const { mission, project } = await smokeProject();
    const existingApproval = reusableResearchApproval(project);
    const estimate = await researchEstimate();
    return json(
      preflightPayload({ mission, project, estimate, existingApproval }),
      existingApproval ? 200 : 409,
    );
  } catch (error) {
    return json({
      success: false,
      contract: TEST_CONTRACT,
      publication_authorized: false,
      error: error?.message || String(error),
    }, 500);
  }
}

export async function POST(request) {
  try {
    const access = await requireAccess(request);
    if (!access.success) return json(access, access.status);
    if (!access.access?.staffAccountId) {
      return json({
        success: false,
        error: "Authenticated staff account required",
      }, 403);
    }

    const { mission, project } = await smokeProject();
    const existingApproval = reusableResearchApproval(project);
    const estimate = await researchEstimate();
    if (existingApproval) {
      return json(preflightPayload({
        mission,
        project,
        estimate,
        existingApproval,
      }));
    }

    const body = await request.json().catch(() => ({}));
    const expectedPhrase = approvalPhrase(estimate);
    if (text(body.approval_phrase) !== expectedPhrase) {
      return json({
        ...preflightPayload({ mission, project, estimate }),
        error: "CREATIVE_RESEARCH_APPROVAL_PHRASE_MISMATCH",
      }, 409);
    }

    const approvedAt = new Date();
    const approval = {
      contract: RESEARCH_APPROVAL_CONTRACT,
      id: randomUUID(),
      approved: true,
      status: "APPROVED",
      scope: "AUTONOMOUS_COMPANY_MARKET_RESEARCH",
      test_contract: TEST_CONTRACT,
      creative_project_id: project.id,
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
      expires_at: new Date(
        approvedAt.getTime() + RESEARCH_APPROVAL_MINUTES * 60 * 1000,
      ).toISOString(),
      approved_by_user_id: access.userId,
      approved_by_staff_account_id: access.access.staffAccountId,
      approved_by_email: access.userEmail || null,
      media_generation_authorized: false,
      publication_authorized: false,
    };

    const updatedProject = await CreativeProjectRuntime.update(project.id, {
      metadata: {
        ...(project.metadata || {}),
        paid_research_approval: approval,
      },
    });

    const activeApproval = reusableResearchApproval(updatedProject);
    if (!activeApproval) {
      throw new Error("CREATIVE_RESEARCH_APPROVAL_PERSISTENCE_FAILED");
    }

    return json({
      success: true,
      contract: TEST_CONTRACT,
      approval_contract: RESEARCH_APPROVAL_CONTRACT,
      status: "RESEARCH_APPROVED",
      creative_mission_id: mission.id,
      creative_project_id: project.id,
      research_approval: {
        id: approval.id,
        provider: approval.provider,
        model: approval.model,
        pricing_id: approval.pricing_id,
        maximum_customer_price: approval.maximum_customer_price,
        currency: approval.currency,
        maximum_calls: approval.maximum_calls,
        approved_at: approval.approved_at,
        expires_at: approval.expires_at,
      },
      paid_research_authorized: true,
      media_generation_authorized: false,
      publication_authorized: false,
      next_action: "/api/creative/tests/gemini-omni-5s",
    });
  } catch (error) {
    return json({
      success: false,
      contract: TEST_CONTRACT,
      publication_authorized: false,
      error: error?.message || String(error),
    }, 500);
  }
}
