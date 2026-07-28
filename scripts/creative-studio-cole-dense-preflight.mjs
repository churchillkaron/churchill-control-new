#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const explicitOrganizationId = text(
  process.env.CREATIVE_SMOKE_ORGANIZATION_ID,
);
const explicitProjectId = text(process.env.COLE_LEY_PROJECT_ID);
const maximumGap = finite(
  process.env.CREATIVE_DENSE_SAMPLE_GAP_SECONDS,
  1.5,
);

const {
  CreativeDenseSemanticPlanRuntime,
} = await import(
  "@/lib/creative/media/runtime/CreativeDenseSemanticPlanRuntime"
);
const { supabaseAdmin } = await import(
  "@/lib/shared/supabase/admin"
);

async function projectById(projectId) {
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("id,organization_id,name,status,archived,created_at,metadata")
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`COLE_LEY_PROJECT_NOT_FOUND:${projectId}`);
  if (data.archived === true || text(data.status).toUpperCase() === "ARCHIVED") {
    throw new Error(`COLE_LEY_PROJECT_ARCHIVED:${projectId}`);
  }
  if (
    explicitOrganizationId &&
    String(data.organization_id) !== explicitOrganizationId
  ) {
    throw new Error(
      `COLE_LEY_PROJECT_ORGANIZATION_MISMATCH:${data.organization_id}`,
    );
  }
  return data;
}

async function discoverProject() {
  if (explicitProjectId) {
    return {
      project: await projectById(explicitProjectId),
      discovery_mode: "EXPLICIT_PROJECT_ID",
    };
  }

  let query = supabaseAdmin
    .from("creative_projects")
    .select("id,organization_id,name,status,archived,created_at,metadata")
    .eq("archived", false)
    .ilike("name", "%Cole%")
    .order("created_at", { ascending: false })
    .limit(50);

  if (explicitOrganizationId) {
    query = query.eq("organization_id", explicitOrganizationId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const candidates = Array.isArray(data) ? data : [];
  const rejected = [];

  for (const project of candidates) {
    try {
      await CreativeDenseSemanticPlanRuntime.context({
        organization_id: project.organization_id,
        creative_project_id: project.id,
      });
      return {
        project,
        discovery_mode: "LATEST_COLE_PROJECT_WITH_VALID_SHORTLIST",
      };
    } catch (error) {
      rejected.push({
        project_id: project.id,
        name: project.name,
        reason: error?.message || String(error),
      });
    }
  }

  const diagnostic = rejected.length
    ? JSON.stringify(rejected.slice(0, 10))
    : "NO_NON_ARCHIVED_COLE_PROJECTS_FOUND";
  throw new Error(`COLE_LEY_DENSE_PROJECT_DISCOVERY_FAILED:${diagnostic}`);
}

const { project, discovery_mode: discoveryMode } = await discoverProject();
const organizationId = text(project.organization_id);
const projectId = text(project.id);

if (!organizationId) {
  throw new Error(`COLE_LEY_PROJECT_ORGANIZATION_ID_MISSING:${projectId}`);
}

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
console.log(`PROJECT_DISCOVERY_MODE=${discoveryMode}`);
console.log(`PROJECT_NAME=${project.name || ""}`);
console.log(`PROJECT_STATUS=${project.status || ""}`);
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
  project: {
    id: projectId,
    organization_id: organizationId,
    name: project.name || null,
    status: project.status || null,
    discovery_mode: discoveryMode,
  },
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
