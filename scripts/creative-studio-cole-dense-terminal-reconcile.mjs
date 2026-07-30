#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} required`);
  return value;
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const organizationId = required("CREATIVE_SMOKE_ORGANIZATION_ID");
const projectId = required("COLE_LEY_PROJECT_ID");
const approvedShortlistIdentity = required(
  "COLE_LEY_PROJECT_SHORTLIST_IDENTITY",
);
const currency = text(process.env.COLE_LEY_CURRENCY || "THB").toUpperCase();
const maximumGap = Number(
  process.env.CREATIVE_DENSE_SAMPLE_GAP_SECONDS || 1.5,
);
const policy = {
  maximum_semantic_sample_gap_seconds: maximumGap,
  minimum_verified_frame_quality_score: Number(
    process.env.CREATIVE_DENSE_MINIMUM_QUALITY_SCORE || 55,
  ),
  require_human_approval: true,
};
const country = process.env.CREATIVE_SMOKE_COUNTRY || "TH";

const {
  CreativeDenseSemanticExecutionPlanRuntime,
} = await import(
  "@/lib/creative/media/runtime/CreativeDenseSemanticExecutionPlanRuntime"
);

const originalPreflight =
  CreativeDenseSemanticExecutionPlanRuntime.preflight.bind(
    CreativeDenseSemanticExecutionPlanRuntime,
  );

function assertReconciliationOnly(preflight = {}) {
  if (
    text(preflight.project_shortlist_identity) !==
    approvedShortlistIdentity
  ) {
    throw new Error("TERMINAL_RECONCILIATION_SHORTLIST_IDENTITY_MISMATCH");
  }

  if (finite(preflight.estimated_ai_calls, -1) !== 0) {
    throw new Error("TERMINAL_RECONCILIATION_NEW_PROVIDER_CALLS_PRESENT");
  }
  if (finite(preflight.cost_estimate?.estimated_customer_price, -1) !== 0) {
    throw new Error("TERMINAL_RECONCILIATION_NEW_COST_PRESENT");
  }

  const reasons = Array.isArray(preflight.reasons)
    ? preflight.reasons.filter(Boolean)
    : [];
  const unsupportedReasons = reasons.filter(
    (reason) => reason !== "DENSE_SEMANTIC_CANDIDATE_RECONCILIATION_REQUIRED",
  );
  if (unsupportedReasons.length) {
    throw new Error(
      `TERMINAL_RECONCILIATION_UNSUPPORTED_BLOCKERS:${unsupportedReasons.join(",")}`,
    );
  }

  const plans = Array.isArray(preflight.candidate_plans)
    ? preflight.candidate_plans
    : [];
  const reconciliationPlans = plans.filter((plan) => plan.reusable !== true);
  if (!reconciliationPlans.length) {
    throw new Error("TERMINAL_RECONCILIATION_NOT_REQUIRED");
  }

  const invalid = reconciliationPlans.filter((plan) => (
    finite(plan.pending_call_count, -1) !== 0 ||
    finite(plan.completed_call_count, -1) !== finite(plan.call_count, -2) ||
    plan.blocking_reason !==
      "DENSE_SEMANTIC_TERMINAL_RECONCILIATION_REQUIRED"
  ));
  if (invalid.length) {
    throw new Error(
      `TERMINAL_RECONCILIATION_EVIDENCE_INCOMPLETE:${invalid
        .map((plan) => plan.candidate_id)
        .join(",")}`,
    );
  }

  return reconciliationPlans;
}

const initialPreflight = await originalPreflight({
  organization_id: organizationId,
  creative_project_id: projectId,
  policy,
  country,
  currency,
});
const initialPlans = assertReconciliationOnly(initialPreflight);

process.env.COLE_LEY_DENSE_PLAN_IDENTITY =
  initialPreflight.dense_semantic_plan_identity;
process.env.COLE_LEY_MAXIMUM_AI_CALLS = String(
  initialPreflight.total_planned_ai_calls,
);
process.env.COLE_LEY_MAXIMUM_CUSTOMER_PRICE = String(
  initialPreflight.total_estimated_customer_price,
);
process.env.COLE_LEY_CURRENCY =
  text(initialPreflight.cost_estimate?.currency || currency).toUpperCase();

CreativeDenseSemanticExecutionPlanRuntime.preflight = async function (
  input = {},
) {
  const current = await originalPreflight(input);
  assertReconciliationOnly(current);
  return {
    ...current,
    ready: true,
    reasons: (current.reasons || []).filter(
      (reason) => reason !==
        "DENSE_SEMANTIC_CANDIDATE_RECONCILIATION_REQUIRED",
    ),
    candidate_plans: (current.candidate_plans || []).map((plan) => (
      plan.reusable === true
        ? plan
        : {
            ...plan,
            ready: true,
            blocking_reason: null,
            reconciliation_required: true,
          }
    )),
  };
};

const {
  CreativeExecutionJobRepository,
} = await import(
  "@/lib/creative/execution/repositories/CreativeExecutionJobRepository"
);
const enqueueWithoutTerminalReconciliation =
  CreativeExecutionJobRepository.enqueue.bind(
    CreativeExecutionJobRepository,
  );

CreativeExecutionJobRepository.enqueue = async function (
  job = {},
) {
  if (job.job_type !== "DENSE_SEMANTIC_RECOVERY") {
    return enqueueWithoutTerminalReconciliation(job);
  }

  let idempotencyKey = [
    job.idempotency_key,
    "terminal-reconciliation-v2",
  ].join(":");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await enqueueWithoutTerminalReconciliation({
      ...job,
      idempotency_key: idempotencyKey,
      payload: {
        ...(job.payload || {}),
        terminal_reconciliation: true,
        terminal_reconciliation_version: 2,
        reconciliation_candidate_ids: initialPlans.map(
          (plan) => plan.candidate_id,
        ),
        new_provider_calls_authorized: 0,
        new_customer_price_authorized: 0,
      },
    });

    if (result.created || result.job?.status !== "COMPLETED") {
      return result;
    }

    idempotencyKey = [
      idempotencyKey,
      "after-stale-completed-job",
      result.job.id,
    ].join(":");
  }

  throw new Error("TERMINAL_RECONCILIATION_STALE_JOB_CHAIN_LIMIT");
};

console.log("============================================================");
console.log("COLE DENSE TERMINAL RECONCILIATION");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(
  `DENSE_SEMANTIC_PLAN_IDENTITY=${initialPreflight.dense_semantic_plan_identity}`,
);
console.log(`RECONCILIATION_CANDIDATE_COUNT=${initialPlans.length}`);
console.log(`COMPLETED_AI_CALLS=${initialPreflight.completed_ai_calls}`);
console.log("NEW_PROVIDER_CALLS_AUTHORIZED=0");
console.log("NEW_CUSTOMER_PRICE_AUTHORIZED=0");
console.log("RUNWAY_AUTHORIZED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("STALE_COMPLETED_JOB_REUSE=BLOCKED");
console.log("============================================================");

await import("./creative-studio-cole-dense-recover.mjs");
