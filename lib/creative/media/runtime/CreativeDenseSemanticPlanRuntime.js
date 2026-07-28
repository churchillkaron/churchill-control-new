import crypto from "node:crypto";

import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  OrganizationServiceRuntime,
} from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import {
  resolveServiceCapabilities,
} from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";
import {
  resolvePrimaryExecutionCapability,
} from "@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver";
import {
  resolveProvider,
} from "@/lib/platform/service-runtime/providers/ProviderResolver";
import {
  PricingRuntime,
} from "@/lib/platform/service-runtime/pricing/PricingRuntime";

const ANALYSIS_SERVICE_ID = "ai.image.analyze";
export const DENSE_SEMANTIC_RUNTIME_VERSION =
  "creative-dense-semantic-checkpointed-v2";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function upper(value) {
  return text(value).toUpperCase();
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export function denseSemanticSourceRange(candidate) {
  const value = object(candidate?.metadata?.original_source_range);
  const start = finite(value.start_seconds, -1);
  const end = finite(value.end_seconds, -1);
  const suppliedDuration = finite(value.duration_seconds, -1);
  const duration = end > start ? end - start : suppliedDuration;
  if (start < 0 || duration <= 0) return null;
  return {
    start_seconds: start,
    end_seconds: start + duration,
    duration_seconds: duration,
  };
}

export function denseSemanticSamplePlan(duration, policy = {}) {
  const maximumGap = Math.max(
    0.5,
    finite(
      policy.maximum_semantic_sample_gap_seconds ??
        policy.maximumSemanticSampleGapSeconds,
      1.5,
    ),
  );
  const safeDuration = Math.max(0.001, finite(duration, 0.001));
  const intervalCount = Math.max(1, Math.ceil(safeDuration / maximumGap));
  const fractions = [];

  for (let index = 0; index <= intervalCount; index += 1) {
    fractions.push(Number(
      Math.max(0.01, Math.min(0.99, index / intervalCount)).toFixed(6),
    ));
  }

  const unique = [...new Set(fractions)].sort((left, right) => left - right);
  return {
    fractions: unique,
    call_count: unique.length,
    maximum_gap_seconds: maximumGap,
    actual_gap_seconds: Number((safeDuration / intervalCount).toFixed(6)),
  };
}

async function loadContext({ organizationId, projectId }) {
  const nodes = await AssetGraphRepository.listByProject({
    organization_id: organizationId,
    creative_project_id: projectId,
  });
  const report = nodes
    .filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.metadata?.project_shortlist_report === true &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    )
    .sort((left, right) =>
      Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0),
    )[0] || null;
  if (!report) throw new Error("PROJECT_SHORTLIST_REPORT_REQUIRED");

  const candidates = nodes
    .filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
      node.metadata?.local_shortlist_candidate === true &&
      node.metadata?.selected_for_ai_verification === true &&
      node.metadata?.project_shortlist_identity ===
        report.metadata?.project_shortlist_identity &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    )
    .sort((left, right) =>
      finite(left.metadata?.shortlist_rank, 9999) -
      finite(right.metadata?.shortlist_rank, 9999),
    );
  if (!candidates.length) {
    throw new Error("PROJECT_SHORTLIST_SELECTION_REQUIRED");
  }

  return { nodes, report, candidates };
}

function candidateReusable(candidate, nodesById, planIdentity, callCount) {
  if (upper(candidate.metadata?.ai_verification_status) !== "COMPLETE") {
    return false;
  }
  if (
    candidate.metadata?.verification_runtime_version !==
    DENSE_SEMANTIC_RUNTIME_VERSION
  ) return false;
  if (candidate.metadata?.dense_semantic_plan_identity !== planIdentity) {
    return false;
  }
  if (finite(candidate.metadata?.paid_analysis_calls, -1) !== callCount) {
    return false;
  }

  const ids = Array.isArray(candidate.metadata?.verified_moment_ids)
    ? candidate.metadata.verified_moment_ids.map(String)
    : [];
  if (ids.length !== 1) return false;
  const moment = nodesById.get(ids[0]);
  return (
    moment?.metadata?.dense_semantic_verification === true &&
    moment?.metadata?.dense_semantic_plan_identity === planIdentity &&
    moment?.metadata?.performance_verified === true &&
    moment?.review?.ai_reviewed === true &&
    Array.isArray(moment?.metadata?.performance_evidence?.frames) &&
    moment.metadata.performance_evidence.frames.length === callCount
  );
}

async function estimate({
  organizationId,
  callCount,
  country,
  currency,
  providerPolicy,
}) {
  if (callCount <= 0) {
    return {
      ready: true,
      service_id: ANALYSIS_SERVICE_ID,
      capability: null,
      provider: null,
      model: null,
      credential_id: null,
      pricing_id: null,
      currency: currency || null,
      unit: "request",
      unit_customer_price: 0,
      call_count: 0,
      estimated_customer_price: 0,
      selection_evidence: { reason: "NO_NEW_PROVIDER_CALLS_REQUIRED" },
    };
  }

  const organizationService = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: ANALYSIS_SERVICE_ID,
  });
  if (!organizationService) {
    return {
      ready: false,
      blocking_reason: `${ANALYSIS_SERVICE_ID} is not enabled for organization`,
      call_count: callCount,
    };
  }

  const capabilities = resolveServiceCapabilities(ANALYSIS_SERVICE_ID);
  const capability = resolvePrimaryExecutionCapability(
    capabilities?.capabilities || [],
  );
  if (!capability) {
    return {
      ready: false,
      blocking_reason: `No execution capability mapped for ${ANALYSIS_SERVICE_ID}`,
      call_count: callCount,
    };
  }

  const selected = await resolveProvider({
    organization_id: organizationId,
    capability,
    country,
    currency,
    policy: {
      ...object(organizationService.provider_policy),
      ...object(providerPolicy),
    },
  });
  const pricing = await PricingRuntime.resolve({
    provider: selected.provider,
    capability,
    model: selected.model,
    country,
    currency,
    usage: { quantity: 1 },
  });
  const unitPrice = finite(pricing.customer_price, 0);

  return {
    ready: true,
    service_id: ANALYSIS_SERVICE_ID,
    capability,
    provider: selected.provider,
    model: selected.model || null,
    credential_id: selected.credential_id || null,
    pricing_id: pricing.pricing_id || null,
    currency: pricing.currency,
    unit: pricing.unit || "request",
    unit_customer_price: unitPrice,
    call_count: callCount,
    estimated_customer_price: Number((unitPrice * callCount).toFixed(6)),
    selection_evidence: selected.selection_evidence || null,
  };
}

export const CreativeDenseSemanticPlanRuntime = {
  async context({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    return loadContext({
      organizationId: organization_id,
      projectId: creative_project_id,
    });
  },

  async preflight({
    organization_id,
    creative_project_id,
    policy = {},
    country = null,
    currency = null,
  } = {}) {
    const { nodes, report, candidates } = await this.context({
      organization_id,
      creative_project_id,
    });
    const nodesById = new Map(nodes.map((node) => [String(node.id), node]));
    const candidatePlans = candidates.map((candidate) => {
      const range = denseSemanticSourceRange(candidate);
      if (!range) {
        return {
          candidate_id: candidate.id,
          ready: false,
          blocking_reason: "LOCAL_SHORTLIST_RANGE_INVALID",
          fractions: [],
          call_count: 0,
          reusable: false,
        };
      }
      const sampling = denseSemanticSamplePlan(range.duration_seconds, policy);
      const planIdentity = hash({
        runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
        project_shortlist_identity:
          report.metadata?.project_shortlist_identity,
        candidate_id: candidate.id,
        source_asset_node_id: candidate.metadata?.source_asset_node_id,
        original_source_range: range,
        sampling,
      });
      return {
        candidate_id: candidate.id,
        source_asset_node_id: candidate.metadata?.source_asset_node_id || null,
        original_source_range: range,
        ready: true,
        plan_identity: planIdentity,
        ...sampling,
        reusable: candidateReusable(
          candidate,
          nodesById,
          planIdentity,
          sampling.call_count,
        ),
      };
    });
    const pending = candidatePlans.filter((plan) => plan.ready && !plan.reusable);
    const estimatedAiCalls = pending.reduce(
      (sum, plan) => sum + plan.call_count,
      0,
    );
    const densePlanIdentity = hash({
      runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
      project_shortlist_identity:
        report.metadata?.project_shortlist_identity,
      candidate_plans: candidatePlans.map((plan) => ({
        candidate_id: plan.candidate_id,
        plan_identity: plan.plan_identity || null,
        call_count: plan.call_count,
        reusable: plan.reusable,
      })),
    });
    const costEstimate = await estimate({
      organizationId: organization_id,
      callCount: estimatedAiCalls,
      country,
      currency,
      providerPolicy: policy.provider_policy || policy.providerPolicy || {},
    });
    const reasons = [];
    if (candidatePlans.some((plan) => !plan.ready)) {
      reasons.push("DENSE_SEMANTIC_CANDIDATE_PLAN_INVALID");
    }
    if (!costEstimate.ready) {
      reasons.push(
        costEstimate.blocking_reason || "DENSE_SEMANTIC_PRICING_NOT_READY",
      );
    }

    return {
      ready: reasons.length === 0,
      reasons,
      runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      project_shortlist_identity:
        report.metadata?.project_shortlist_identity || null,
      dense_semantic_plan_identity: densePlanIdentity,
      maximum_semantic_sample_gap_seconds:
        denseSemanticSamplePlan(1, policy).maximum_gap_seconds,
      selected_candidate_count: candidates.length,
      reusable_candidate_count:
        candidatePlans.filter((plan) => plan.reusable).length,
      pending_candidate_count: pending.length,
      estimated_ai_calls: estimatedAiCalls,
      candidate_plans: candidatePlans,
      cost_estimate: costEstimate,
      explicit_paid_authorization_required: estimatedAiCalls > 0,
      production_started: false,
    };
  },

  assertAuthorization({ authorization = {}, preflight }) {
    if (preflight.estimated_ai_calls <= 0) return true;
    const valid =
      authorization.approved === true &&
      text(authorization.dense_semantic_plan_identity) ===
        text(preflight.dense_semantic_plan_identity) &&
      finite(authorization.maximum_ai_calls, -1) >=
        preflight.estimated_ai_calls &&
      finite(authorization.maximum_customer_price, -1) >=
        finite(preflight.cost_estimate?.estimated_customer_price, 0) &&
      upper(authorization.currency) ===
        upper(preflight.cost_estimate?.currency);
    if (valid) return true;

    const error = new Error("DENSE_SEMANTIC_AUTHORIZATION_MISMATCH");
    error.validation = {
      required: {
        approved: true,
        dense_semantic_plan_identity:
          preflight.dense_semantic_plan_identity,
        maximum_ai_calls: preflight.estimated_ai_calls,
        maximum_customer_price:
          preflight.cost_estimate?.estimated_customer_price,
        currency: preflight.cost_estimate?.currency,
      },
      preflight,
    };
    throw error;
  },
};
