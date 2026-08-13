import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CreativeMasterPlanRuntime,
} from "@/lib/creative/director/runtime/CreativeMasterPlanRuntime";
import {
  CreativeDynamicTribunalRuntime,
} from "@/lib/creative/director/runtime/CreativeDynamicTribunalRuntime";
import {
  evaluateCreativeWorldClassBenchmark,
  scoreCreativeWorldClassBenchmarkCase,
} from "@/lib/creative/quality/runtime/CreativeWorldClassBenchmarkRuntime";

const CHURCHILL = "33336a72-acb5-474e-856b-8be0269360e2";
const COLE_LEY = "9550b843-b83c-4d15-b02d-a0b5ca23346e";

const CHURCHILL_QUALITY = Object.freeze({
  version: "AVANTIQO_CREATIVE_QUALITY_V1",
  require_brand_fit: true,
  minimum_scene_score: 90,
  require_non_ai_feel: true,
  regenerate_below_score: 88,
  require_story_progression: true,
  require_product_continuity: true,
  require_identity_continuity: true,
});

const COLE_QUALITY = Object.freeze({
  version: "AVANTIQO_WORLD_CLASS_TEMPORAL_V1",
  require_brand_fit: true,
  minimum_scene_score: 92,
  require_non_ai_feel: true,
  regenerate_below_score: 88,
  require_story_progression: true,
  require_product_continuity: false,
  require_identity_continuity: true,
});

const CASES = Object.freeze([
  Object.freeze({
    id: "churchill-entrance-still",
    label: "Churchill entrance master still",
    organization_id: CHURCHILL,
    source_project_id: "5dc4897b-88a5-40f0-a269-033a4e96cd65",
    production_type: "IMAGE",
    quality: CHURCHILL_QUALITY,
    asset_ids: Object.freeze([
      "f0c96f1a-6719-4dc2-8b9a-d095864d273a",
      "d10ddc3a-386f-403b-9bb4-2cfe40c7c655",
      "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
    ]),
    benchmark: Object.freeze({
      organization_name: "Churchill",
      required_anchors: Object.freeze(["entrance", "red carpet", "pool table"]),
    }),
  }),
  Object.freeze({
    id: "churchill-food-editorial-stills",
    label: "Churchill food editorial still system",
    organization_id: CHURCHILL,
    source_project_id: "d83dd7df-48b1-4ddd-bd98-88d409251755",
    production_type: "IMAGE",
    quality: CHURCHILL_QUALITY,
    objective:
      "Create a premium editorial still system for Churchill Restaurant & Bar using only the registered real food and venue references. Make the food physically specific and source-faithful rather than generic hospitality imagery. Build a coherent art direction that can hold striploin, smoked salmon, nachos, Mediterranean salad and beef carpaccio together while preserving the recognisable Churchill setting and avoiding invented dishes, ingredients, claims, people or location details.",
    asset_ids: Object.freeze([
      "9a7f96b4-1c77-47f5-8377-69f0404929ee",
      "7df53ffb-b0dd-4a25-bc68-8e4225fe782f",
      "c9aafc12-9f77-4305-8bb6-52e2b1db2eb4",
      "707932d6-467d-4f07-a938-829515abf124",
      "e767ad1c-e9ba-4bc3-aebc-525e963a8c78",
      "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
    ]),
    benchmark: Object.freeze({
      organization_name: "Churchill",
      product_names: Object.freeze(["striploin", "smoked salmon", "nachos"]),
      required_anchors: Object.freeze(["food"]),
    }),
  }),
  Object.freeze({
    id: "churchill-audio-package",
    label: "Churchill campaign music and sound package",
    organization_id: CHURCHILL,
    source_project_id: "614910af-90ae-4024-a2b0-e9ef7a58e1e9",
    production_type: "AUDIO",
    quality: CHURCHILL_QUALITY,
    asset_ids: Object.freeze([
      "f0c96f1a-6719-4dc2-8b9a-d095864d273a",
      "d10ddc3a-386f-403b-9bb4-2cfe40c7c655",
      "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
      "cb027610-625c-4751-99a0-6a41b3597237",
    ]),
    benchmark: Object.freeze({
      organization_name: "Churchill",
      required_anchors: Object.freeze(["music", "sound", "entrance", "pool"]),
    }),
  }),
  Object.freeze({
    id: "cole-full-song-artist-film",
    label: "Cole Ley full-song original artist film",
    organization_id: COLE_LEY,
    source_project_id: "6fbac0e8-ab00-44be-9b26-94bf25f28c1e",
    production_type: "VIDEO",
    quality: COLE_QUALITY,
    asset_ids: Object.freeze([
      "b6acc9fd-9fb5-470d-943f-3e3b4b23efc2",
      "e501570d-e54e-491f-8bdb-56cd012615a2",
      "f29d002c-1a05-4d4a-beec-af09ddb28b69",
      "b0fb646f-bc0f-4959-8d14-68a5edd645bb",
      "28aeb19a-4135-4350-98ca-d1c9b877da34",
    ]),
    benchmark: Object.freeze({
      organization_name: "Cole Ley",
      required_anchors: Object.freeze(["Show Me Love", "205", "authentic love"]),
    }),
  }),
  Object.freeze({
    id: "cole-live-performance-showreel",
    label: "Cole Ley live-performance showreel",
    organization_id: COLE_LEY,
    source_project_id: "3866623f-d9a6-45d3-99b8-e978666cc028",
    production_type: "VIDEO",
    quality: COLE_QUALITY,
    asset_ids: Object.freeze([
      "e501570d-e54e-491f-8bdb-56cd012615a2",
      "d1548f5a-6b18-4b2e-bbda-85aa4d609791",
      "61976eb0-ff9d-4f0f-af41-ec3d6c24c264",
      "c89501d4-56ac-4415-b190-dd831b03d718",
      "cee439a8-df25-46ef-bfee-1e4c59863855",
      "e44190e8-ca81-4fc9-84f8-4da0a651dba0",
      "ad4c9aab-7527-41e8-bbc1-dcc7a82db443",
      "fee4512a-6c63-43af-8f65-9ecf34ba040a",
    ]),
    benchmark: Object.freeze({
      organization_name: "Cole Ley",
      required_anchors: Object.freeze(["live performance", "original audio", "lip sync"]),
    }),
  }),
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function fixtureFor(caseId) {
  const fixture = CASES.find((entry) => entry.id === text(caseId));
  if (!fixture) throw new Error(`CREATIVE_BENCHMARK_CASE_NOT_REGISTERED:${text(caseId) || "UNKNOWN"}`);
  return fixture;
}

async function fetchOne(table, id) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`BENCHMARK_SOURCE_NOT_FOUND:${table}:${id}`);
  return data;
}

async function fetchAssets(organizationId, ids) {
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select(
      "id,organization_id,asset_type,name,title,file_name,description,analysis,tags,file_url,image_url,metadata,status,archived,ai_generated",
    )
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw error;

  const byId = new Map((data || []).map((asset) => [asset.id, asset]));
  return ids.map((id) => {
    const asset = byId.get(id);
    if (!asset) throw new Error(`BENCHMARK_ASSET_NOT_FOUND:${id}`);
    if (
      asset.archived === true ||
      ["ARCHIVED", "DISABLED", "DELETED"].includes(text(asset.status).toUpperCase())
    ) {
      throw new Error(`BENCHMARK_ASSET_UNAVAILABLE:${id}`);
    }
    return asset;
  });
}

async function sourceContext(fixture) {
  const sourceProject = await fetchOne("creative_projects", fixture.source_project_id);
  if (String(sourceProject.organization_id) !== String(fixture.organization_id)) {
    throw new Error(`BENCHMARK_PROJECT_ORGANIZATION_MISMATCH:${fixture.id}`);
  }

  let sourceMission = {};
  if (sourceProject.creative_mission_id) {
    sourceMission = await fetchOne("creative_missions", sourceProject.creative_mission_id);
    if (String(sourceMission.organization_id) !== String(fixture.organization_id)) {
      throw new Error(`BENCHMARK_MISSION_ORGANIZATION_MISMATCH:${fixture.id}`);
    }
  }

  const assets = await fetchAssets(fixture.organization_id, fixture.asset_ids);
  const objective = text(
    fixture.objective || sourceProject.objective || sourceProject.description,
  );
  if (!objective) throw new Error(`BENCHMARK_OBJECTIVE_REQUIRED:${fixture.id}`);

  const project = {
    ...sourceProject,
    id: `benchmark:${fixture.id}`,
    name: fixture.label,
    objective,
    description: objective,
    production_type: fixture.production_type,
    metadata: {
      ...object(sourceProject.metadata),
      creative_quality_policy: fixture.quality,
      benchmark_fixture: true,
      benchmark_case_id: fixture.id,
      production_execution_allowed: false,
      public_publish_authorized: false,
      publish_authorized: false,
    },
  };

  const mission = {
    ...sourceMission,
    id: `benchmark-mission:${fixture.id}`,
    title: fixture.label,
    objective,
    business_goal: objective,
    metadata: {
      ...object(sourceMission.metadata),
      benchmark_fixture: true,
      benchmark_case_id: fixture.id,
      production_execution_allowed: false,
      public_publish_authorized: false,
      publish_authorized: false,
    },
  };

  const brief = {
    id: `benchmark-brief:${fixture.id}`,
    organization_id: fixture.organization_id,
    creative_project_id: project.id,
    creative_mission_id: mission.id,
    business_goal: objective,
    creative_objective: objective,
    target_audience: sourceMission.audience || {},
    channels: sourceProject.target_channels || sourceMission.channels || [],
    languages: sourceProject.target_languages || [],
    duration_seconds: sourceProject.target_duration || null,
    metadata: {
      creative_quality_policy: fixture.quality,
      benchmark_fixture: true,
      production_execution_allowed: false,
    },
  };

  return { mission, project, brief, assets };
}

function scoringPlan(plan = {}) {
  return {
    workflow_kind: plan.workflow_kind || null,
    concept: object(plan.concept),
    creative_review: object(plan.creative_review),
    creative_tribunal: object(plan.creative_tribunal),
    deliverables: Array.isArray(plan.deliverables) ? plan.deliverables : [],
    production: object(plan.production),
  };
}

function scoringCase(fixture, reviewed) {
  return {
    id: fixture.id,
    label: fixture.label,
    benchmark: fixture.benchmark,
    master_plan: {
      plan: scoringPlan(reviewed.plan),
    },
  };
}

function publicScore(entry) {
  const { direction_text, ...score } = scoreCreativeWorldClassBenchmarkCase(entry);
  return score;
}

async function runCase(caseId) {
  const fixture = fixtureFor(caseId);
  const context = await sourceContext(fixture);

  const master = await CreativeMasterPlanRuntime.create({
    organization_id: fixture.organization_id,
    mission: context.mission,
    project: context.project,
    brief: context.brief,
    assets: context.assets,
  });

  const reviewed = await CreativeDynamicTribunalRuntime.review({
    organization_id: fixture.organization_id,
    creative_mission_id: context.mission.id,
    creative_project_id: context.project.id,
    mission: context.mission,
    project: context.project,
    brief: context.brief,
    assets: context.assets,
    available_capabilities: master.available_production_capabilities,
    master,
  });

  const caseResult = scoringCase(fixture, reviewed);
  return {
    case_result: caseResult,
    score: publicScore(caseResult),
    execution: {
      organization_id: fixture.organization_id,
      source_project_id: fixture.source_project_id,
      source_asset_ids: fixture.asset_ids,
      reasoning_provider_calls_executed: true,
      media_generation_executed: false,
      publication_executed: false,
      production_graph_created: false,
      production_task_created: false,
      provider: reviewed.provider || master.provider || null,
      model: reviewed.model || master.model || null,
      master_usage: master.usage || null,
      master_billing: master.billing || null,
      tribunal_billing: reviewed.tribunal_billing || null,
      repair_billing: reviewed.repair_billing || null,
    },
  };
}

function normalizeSubmittedCases(cases = []) {
  if (!Array.isArray(cases)) throw new Error("CREATIVE_BENCHMARK_CASES_REQUIRED");
  const submitted = new Map(cases.map((entry) => [text(entry?.id), entry]));
  if (submitted.size !== CASES.length) {
    throw new Error(`CREATIVE_BENCHMARK_REQUIRES_${CASES.length}_CASES`);
  }

  return CASES.map((fixture) => {
    const entry = submitted.get(fixture.id);
    if (!entry?.master_plan?.plan) {
      throw new Error(`CREATIVE_BENCHMARK_CASE_RESULT_REQUIRED:${fixture.id}`);
    }
    return {
      id: fixture.id,
      label: fixture.label,
      benchmark: fixture.benchmark,
      master_plan: {
        plan: scoringPlan(entry.master_plan.plan),
      },
    };
  });
}

function evaluate(cases = []) {
  const normalized = normalizeSubmittedCases(cases);
  return evaluateCreativeWorldClassBenchmark({ cases: normalized });
}

export const CreativeWorldClassLiveBenchmarkRuntime = Object.freeze({
  listCases() {
    return CASES.map((fixture) => ({
      id: fixture.id,
      label: fixture.label,
      organization_id: fixture.organization_id,
      production_type: fixture.production_type,
    }));
  },

  getCase(caseId) {
    const fixture = fixtureFor(caseId);
    return {
      id: fixture.id,
      label: fixture.label,
      organization_id: fixture.organization_id,
      production_type: fixture.production_type,
    };
  },

  runCase,
  evaluate,
});
