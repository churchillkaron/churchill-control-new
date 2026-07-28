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

function storedFrameIndexes(candidate, plan) {
  const metadata = object(candidate?.metadata);
  if (metadata.verification_runtime_version !== DENSE_SEMANTIC_RUNTIME_VERSION) {
    return new Set();
  }
  if (metadata.dense_semantic_plan_identity !== plan.plan_identity) {
    return new Set();
  }

  const indexes = new Set();
  const frames = Array.isArray(metadata.ai_verification_frame_results)
    ? metadata.ai_verification_frame_results
    : [];
  for (const frame of frames) {
    const index = finite(frame?.sample_index, -1);
    const status = upper(frame?.status || "COMPLETED");
    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < plan.call_count &&
      ["COMPLETED", "AMBIGUOUS"].includes(status)
    ) {
      indexes.add(index);
    }
  }
  return indexes;
}

function rejectedTerminal(candidate, plan, completedCallCount) {
  const metadata = object(candidate?.metadata);
  if (upper(metadata.ai_verification_status) !== "REJECTED") return false;
  if (metadata.verification_runtime_version !== DENSE_SEMANTIC_RUNTIME_VERSION) {
    return false;
  }
  if (metadata.dense_semantic_plan_identity !== plan.plan_identity) return false;
  if (metadata.dense_semantic_terminal !== true) return false;
  if (completedCallCount !== plan.call_count) return false;

  const frames = Array.isArray(metadata.ai_verification_frame_results)
    ? metadata.ai_verification_frame_results
    : [];
  return frames.length === plan.call_count && frames.some((frame) =>
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
      const completedCallCount = plan.reusable === true
        ? plan.call_count
        : storedFrameIndexes(candidate, plan).size;
      const rejected = rejectedTerminal(
        candidate,
        plan,
        completedCallCount,
      );
      const reusable = plan.reusable === true || rejected;
      const pendingCallCount = reusable
        ? 0
        : Math.max(0, plan.call_count - completedCallCount);
      const ready = plan.ready === true && !(
        pendingCallCount === 0 && reusable !== true
      );

      return {
        ...plan,
        ready,
        blocking_reason: ready
          ? plan.blocking_reason || null
          : plan.blocking_reason ||
            "DENSE_SEMANTIC_TERMINAL_RECONCILIATION_REQUIRED",
        reusable,
        terminal_status: reusable
          ? upper(candidate?.metadata?.ai_verification_status) || "COMPLETE"
          : null,
        completed_call_count: completedCallCount,
        pending_call_count: pendingCallCount,
      };
    });
    const pending = candidatePlans.filter((plan) =>
      plan.ready && !plan.reusable && plan.pending_call_count > 0
    );
    const estimatedAiCalls = pending.reduce(
      (sum, plan) => sum + finite(plan.pending_call_count, 0),
      0,
    );
    const completedAiCalls = candidatePlans.reduce(
      (sum, plan) => sum + finite(plan.completed_call_count, 0),
      0,
    );
    const totalPlannedAiCalls = candidatePlans.reduce(
      (sum, plan) => sum + finite(plan.call_count, 0),
      0,
    );

    // Preserve the identity emitted by the original approved preflight while
    // removing mutable completion state from future calculations. At the first
    // preflight every candidate had reusable=false, so fixing that value keeps
    // the approved identity stable across all resumable worker cycles.
    const denseSemanticPlanIdentity = hash({
      runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
      project_shortlist_identity: base.project_shortlist_identity,
      candidate_plans: candidatePlans.map((plan) => ({
        candidate_id: plan.candidate_id,
        plan_identity: plan.plan_identity || null,
        call_count: plan.call_count,
        reusable: false,
      })),
    });
    const costEstimate = correctedCostEstimate(
      base.cost_estimate,
      estimatedAiCalls,
      currency,
    );
    const unitPrice = finite(
      base.cost_estimate?.unit_customer_price ??
      costEstimate.unit_customer_price,
      0,
    );
    const reasons = [...(Array.isArray(base.reasons) ? base.reasons : [])];
    if (candidatePlans.some((plan) => !plan.ready)) {
      reasons.push("DENSE_SEMANTIC_CANDIDATE_RECONCILIATION_REQUIRED");
    }

    return {
      ...base,
      ready: reasons.length === 0,
      reasons: [...new Set(reasons)],
      runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
      dense_semantic_plan_identity: denseSemanticPlanIdentity,
      candidate_plans: candidatePlans,
      reusable_candidate_count:
        candidatePlans.filter((plan) => plan.reusable).length,
      pending_candidate_count: pending.length,
      completed_ai_calls: completedAiCalls,
      estimated_ai_calls: estimatedAiCalls,
      total_planned_ai_calls: totalPlannedAiCalls,
      cost_estimate: costEstimate,
      total_estimated_customer_price: Number(
        (unitPrice * totalPlannedAiCalls).toFixed(6),
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
        finite(preflight.total_planned_ai_calls, preflight.estimated_ai_calls) &&
      finite(authorization.maximum_customer_price, -1) >=
        finite(
          preflight.total_estimated_customer_price,
          preflight.cost_estimate?.estimated_customer_price,
        ) &&
      upper(authorization.currency) ===
        upper(preflight.cost_estimate?.currency);
    if (valid) return true;

    const error = new Error("DENSE_SEMANTIC_AUTHORIZATION_MISMATCH");
    error.validation = {
      required: {
        approved: true,
        dense_semantic_plan_identity:
          preflight.dense_semantic_plan_identity,
        maximum_ai_calls:
          preflight.total_planned_ai_calls || preflight.estimated_ai_calls,
        maximum_customer_price:
          preflight.total_estimated_customer_price ??
          preflight.cost_estimate?.estimated_customer_price,
        currency: preflight.cost_estimate?.currency,
      },
      preflight,
    };
    throw error;
  },
};
