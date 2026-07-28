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

const organizationId = required("CREATIVE_SMOKE_ORGANIZATION_ID");
const projectId = required("COLE_LEY_PROJECT_ID");
const maximumGap = Number(
  process.env.CREATIVE_DENSE_SAMPLE_GAP_SECONDS || 1.5,
);

const {
  CreativeDenseSemanticPlanRuntime,
} = await import(
  "@/lib/creative/media/runtime/CreativeDenseSemanticPlanRuntime"
);

const result = await CreativeDenseSemanticPlanRuntime.preflight({
  organization_id: organizationId,
  creative_project_id: projectId,
  policy: {
    maximum_semantic_sample_gap_seconds: maximumGap,
  },
  country: process.env.CREATIVE_SMOKE_COUNTRY || "TH",
  currency: process.env.CREATIVE_SMOKE_CURRENCY || "THB",
});

console.log("============================================================");
console.log("COLE DENSE SEMANTIC PREFLIGHT");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${result.organization_id}`);
console.log(`CREATIVE_PROJECT_ID=${result.creative_project_id}`);
console.log(
  `PROJECT_SHORTLIST_IDENTITY=${result.project_shortlist_identity || ""}`,
);
console.log(
  `DENSE_SEMANTIC_PLAN_IDENTITY=${result.dense_semantic_plan_identity}`,
);
console.log(
  `MAXIMUM_SEMANTIC_SAMPLE_GAP_SECONDS=${result.maximum_semantic_sample_gap_seconds}`,
);
console.log(`SELECTED_CANDIDATE_COUNT=${result.selected_candidate_count}`);
console.log(`REUSABLE_CANDIDATE_COUNT=${result.reusable_candidate_count}`);
console.log(`PENDING_CANDIDATE_COUNT=${result.pending_candidate_count}`);
console.log(`ESTIMATED_AI_CALLS=${result.estimated_ai_calls}`);
console.log(
  `COST_ESTIMATE_READY=${result.cost_estimate?.ready === true ? "YES" : "NO"}`,
);
console.log(`CURRENCY=${result.cost_estimate?.currency || ""}`);
console.log(
  `UNIT_CUSTOMER_PRICE=${result.cost_estimate?.unit_customer_price ?? ""}`,
);
console.log(
  `ESTIMATED_CUSTOMER_PRICE=${result.cost_estimate?.estimated_customer_price ?? ""}`,
);
console.log(
  `PROVIDER=${result.cost_estimate?.provider || ""}`,
);
console.log(`MODEL=${result.cost_estimate?.model || ""}`);
console.log(`DENSE_PREFLIGHT_READY=${result.ready ? "PASS" : "FAIL"}`);
console.log(`BLOCKING_REASONS=${result.reasons.join(",")}`);
console.log("PROVIDER_CALLS_EXECUTED=0");
console.log("WALLET_CHARGES=0");
console.log("PRODUCTION_STARTED=NO");
console.log("============================================================");

console.log(JSON.stringify({
  authorization: {
    approved: true,
    dense_semantic_plan_identity: result.dense_semantic_plan_identity,
    maximum_ai_calls: result.estimated_ai_calls,
    maximum_customer_price:
      result.cost_estimate?.estimated_customer_price ?? 0,
    currency: result.cost_estimate?.currency || null,
  },
  candidate_plans: result.candidate_plans,
}, null, 2));

if (!result.ready) process.exitCode = 2;
