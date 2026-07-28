import crypto from "node:crypto";

import {
  CreativeDenseSemanticPlanRuntime,
  DENSE_SEMANTIC_RUNTIME_VERSION,
} from "@/lib/creative/media/runtime/CreativeDenseSemanticPlanRuntime";

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

function rejectedTerminal(candidate, plan) {
  const metadata = object(candidate?.metadata);
  if (upper(metadata.ai_verification_status) !== "REJECTED") return false;
  if (metadata.verification_runtime_version !== DENSE_SEMANTIC_RUNTIME_VERSION) {
    return false;
  }
  if (metadata.dense_semantic_plan_identity !== plan.plan_identity) return false;
  if (metadata.dense_semantic_terminal !== true) return false;

  const calls = finite(metadata.paid_analysis_calls, 0);
  const frames = Array.isArray(metadata.ai_verification_frame_results)
    ? metadata.ai_verification_frame_results
    : [];
  if (calls <= 0 || calls > plan.call_count || frames.length !== calls) {
    return false;
  }

  return frames.some((frame) =>
    frame?.accepted !== true || upper(frame?.status) === "AMBIGUOUS"
  );
}

function correctedCostEstimate(base, callCount, currency = null) {
  if (callCount <= 0) {
    return {
      ready: true,
      service_id: base?.service_id || "ai.image.analyze",
      capability: base?.capability || null,
      provider: null,
      model: null,
      credential_id: null,
      pricing_id: null,
      currency: base?.currency || currency || null,
      unit: base?.unit || "request",
      unit_customer_price: 0,
      call_count: 0,
      estimated_customer_price: 0,
      selection_evidence: { reason: "NO_NEW_PROVIDER_CALLS_REQUIRED" },
    };
  }

  const unitPrice = finite(base?.unit_customer_price, 0);
  return {
    ...object(base),
    call_count: callCount,
    estimated_customer_price: Number((unitPrice * callCount).toFixed(6)),
  };
}

export const CreativeDenseSemanticExecutionPlanRuntime = {
  async context(input = {}) {
    return CreativeDenseSemanticPlanRuntime.context(input);
  },

  async preflight({
    organization_id,
    creative_project_id,
    policy = {},
    country = null,
    currency = null,
  } = {}) {
    const base = await CreativeDenseSemanticPlanRuntime.preflight({
      organization_id,
      creative_project_id,
      policy,
      country,
      currency,
    });
    const { nodes, candidates } = await CreativeDenseSemanticPlanRuntime.context({
      organization_id,
      creative_project_id,
    });
    const candidatesById = new Map(
      candidates.map((candidate) => [String(candidate.id), candidate]),
    );

    const candidatePlans = base.candidate_plans.map((plan) => {
      const candidate = candidatesById.get(String(plan.candidate_id));
      const reusable = plan.reusable === true || rejectedTerminal(candidate, plan);
      return {
        ...plan,
        reusable,
        terminal_status: reusable
          ? upper(candidate?.metadata?.ai_verification_status) || "COMPLETE"
          : null,
      };
    });
    const pending = candidatePlans.filter((plan) => plan.ready && !plan.reusable);
    const estimatedAiCalls = pending.reduce(
      (sum, plan) => sum + finite(plan.call_count, 0),
      0,
    );
    const denseSemanticPlanIdentity = hash({
      runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
      project_shortlist_identity: base.project_shortlist_identity,
      candidate_plans: candidatePlans.map((plan) => ({
        candidate_id: plan.candidate_id,
        source_asset_node_id: plan.source_asset_node_id,
        plan_identity: plan.plan_identity || null,
        original_source_range: plan.original_source_range || null,
        fractions: plan.fractions || [],
        call_count: plan.call_count,
        maximum_gap_seconds: plan.maximum_gap_seconds,
      })),
    });

    return {
      ...base,
      runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
      dense_semantic_plan_identity: denseSemanticPlanIdentity,
      candidate_plans: candidatePlans,
      reusable_candidate_count:
        candidatePlans.filter((plan) => plan.reusable).length,
      pending_candidate_count: pending.length,
      estimated_ai_calls: estimatedAiCalls,
      cost_estimate: correctedCostEstimate(
        base.cost_estimate,
        estimatedAiCalls,
        currency,
      ),
      explicit_paid_authorization_required: estimatedAiCalls > 0,
      execution_plan_stable: true,
      production_started: false,
      node_count: nodes.length,
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
