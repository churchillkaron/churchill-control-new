import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CreativeMasterPlanRuntime,
} from "@/lib/creative/director/runtime/CreativeMasterPlanRuntime";
import {
  CreativeTemporalMasterPlanRuntime,
} from "@/lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime";
import {
  CreativeWorkflowRegistry,
} from "@/lib/creative/director/registry/CreativeWorkflowRegistry";
import {
  CreativeDynamicTribunalRuntime,
} from "@/lib/creative/director/runtime/CreativeDynamicTribunalRuntime";
import {
  evaluateCreativeWorldClassBenchmark,
  scoreCreativeWorldClassBenchmarkCase,
} from "@/lib/creative/quality/runtime/CreativeWorldClassBenchmarkRuntime";
import {
  resolveBenchmarkAssets,
} from "@/lib/creative/quality/runtime/CreativeBenchmarkAssetResolver";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function fixture(input = {}) {
  const normalized = object(input);
  if (!text(normalized.id)) {
    throw new Error("CREATIVE_BENCHMARK_FIXTURE_ID_REQUIRED");
  }
  if (!text(normalized.label)) {
    throw new Error(`CREATIVE_BENCHMARK_FIXTURE_LABEL_REQUIRED:${normalized.id}`);
  }
  if (!text(normalized.organization_id)) {
    throw new Error(`CREATIVE_BENCHMARK_FIXTURE_ORGANIZATION_REQUIRED:${normalized.id}`);
  }
  if (!text(normalized.source_project_id)) {
    throw new Error(`CREATIVE_BENCHMARK_FIXTURE_PROJECT_REQUIRED:${normalized.id}`);
  }
  if (!text(normalized.production_type)) {
    throw new Error(`CREATIVE_BENCHMARK_FIXTURE_PRODUCTION_TYPE_REQUIRED:${normalized.id}`);
  }
  if (!Object.keys(object(normalized.quality)).length) {
    throw new Error(`CREATIVE_BENCHMARK_FIXTURE_QUALITY_REQUIRED:${normalized.id}`);
  }
  if (!Object.keys(object(normalized.benchmark)).length) {
    throw new Error(`CREATIVE_BENCHMARK_FIXTURE_SCORING_REQUIRED:${normalized.id}`);
  }
  return normalized;
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

function benchmarkAnchors(benchmark = {}) {
  return [
    ...list(benchmark.required_anchors),
    ...list(benchmark.product_names),
    ...list(benchmark.audience_terms),
    ...list(benchmark.market_terms),
    text(benchmark.organization_name),
  ].filter(Boolean);
}

async function sourceContext(inputFixture) {
  const benchmarkFixture = fixture(inputFixture);
  const sourceProject = await fetchOne(
    "creative_projects",
    benchmarkFixture.source_project_id,
  );

  if (
    String(sourceProject.organization_id) !==
    String(benchmarkFixture.organization_id)
  ) {
    throw new Error(
      `BENCHMARK_PROJECT_ORGANIZATION_MISMATCH:${benchmarkFixture.id}`,
    );
  }

  let sourceMission = {};
  if (sourceProject.creative_mission_id) {
    sourceMission = await fetchOne(
      "creative_missions",
      sourceProject.creative_mission_id,
    );
    if (
      String(sourceMission.organization_id) !==
      String(benchmarkFixture.organization_id)
    ) {
      throw new Error(
        `BENCHMARK_MISSION_ORGANIZATION_MISMATCH:${benchmarkFixture.id}`,
      );
    }
  }

  const assets = await resolveBenchmarkAssets({
    organization_id: benchmarkFixture.organization_id,
    production_type: benchmarkFixture.production_type,
    anchors: benchmarkAnchors(benchmarkFixture.benchmark),
    minimum: 2,
    maximum: Math.max(6, list(benchmarkFixture.asset_ids).length),
  });

  const objective = text(
    benchmarkFixture.objective ||
      sourceProject.objective ||
      sourceProject.description,
  );
  if (!objective) {
    throw new Error(`BENCHMARK_OBJECTIVE_REQUIRED:${benchmarkFixture.id}`);
  }

  const project = {
    ...sourceProject,
    id: `benchmark:${benchmarkFixture.id}`,
    name: benchmarkFixture.label,
    objective,
    description: objective,
    production_type: benchmarkFixture.production_type,
    metadata: {
      ...object(sourceProject.metadata),
      creative_quality_policy: benchmarkFixture.quality,
      benchmark_fixture: true,
      benchmark_case_id: benchmarkFixture.id,
      benchmark_asset_resolution: "CURRENT_ORGANIZATION_SOURCE_EVIDENCE",
      production_execution_allowed: false,
      public_publish_authorized: false,
      publish_authorized: false,
    },
  };

  const mission = {
    ...sourceMission,
    id: `benchmark-mission:${benchmarkFixture.id}`,
    title: benchmarkFixture.label,
    objective,
    business_goal: objective,
    metadata: {
      ...object(sourceMission.metadata),
      benchmark_fixture: true,
      benchmark_case_id: benchmarkFixture.id,
      production_execution_allowed: false,
      public_publish_authorized: false,
      publish_authorized: false,
    },
  };

  const brief = {
    id: `benchmark-brief:${benchmarkFixture.id}`,
    organization_id: benchmarkFixture.organization_id,
    creative_project_id: project.id,
    creative_mission_id: mission.id,
    business_goal: objective,
    creative_objective: objective,
    target_audience: sourceMission.audience || {},
    channels: sourceProject.target_channels || sourceMission.channels || [],
    languages: sourceProject.target_languages || [],
    duration_seconds: sourceProject.target_duration || null,
    metadata: {
      creative_quality_policy: benchmarkFixture.quality,
      benchmark_fixture: true,
      production_execution_allowed: false,
    },
  };

  return {
    fixture: benchmarkFixture,
    mission,
    project,
    brief,
    assets,
  };
}

function scoringPlan(plan = {}) {
  return {
    workflow_kind: plan.workflow_kind || null,
    concept: object(plan.concept),
    story: object(plan.story),
    creative_review: object(plan.creative_review),
    creative_tribunal: object(plan.creative_tribunal),
    deliverables: Array.isArray(plan.deliverables) ? plan.deliverables : [],
    production: object(plan.production),
    scenes: Array.isArray(plan.scenes) ? plan.scenes : [],
  };
}

function scoringCase(benchmarkFixture, reviewed) {
  return {
    id: benchmarkFixture.id,
    label: benchmarkFixture.label,
    benchmark: benchmarkFixture.benchmark,
    master_plan: {
      plan: scoringPlan(reviewed.plan),
    },
  };
}

function publicScore(entry) {
  const { direction_text, ...score } = scoreCreativeWorldClassBenchmarkCase(entry);
  return score;
}

function rejectedMaster(master, tribunal) {
  return {
    ...master,
    plan: {
      ...object(master?.plan),
      creative_tribunal: {
        contract: tribunal?.contract || "CREATIVE_DYNAMIC_TRIBUNAL_V1",
        passed: false,
        panel: tribunal?.panel || null,
        reviews: tribunal?.reviews || [],
        verdict: tribunal?.verdict || {},
      },
    },
    creative_tribunal: {
      contract: tribunal?.contract || "CREATIVE_DYNAMIC_TRIBUNAL_V1",
      passed: false,
      panel: tribunal?.panel || null,
      reviews: tribunal?.reviews || [],
      verdict: tribunal?.verdict || {},
    },
  };
}

// The director routes on the workflow's executor: CreativeDirectorRuntime sends
// TEMPORAL work to the temporal pipeline and everything else to the universal one,
// because temporal direction is built by a specialist across separate scene
// architecture and shot planning calls. The benchmark drove every case through the
// universal master plan runtime, so for video it asked a single call to produce what a
// multi-call specialist produces. Both temporal cases failed on SCENES_REQUIRED no
// matter how the request was worded, because the runtime being measured does not build
// scenes at all.
//
// Cases now go to the runtime the workflow's executor names, so the benchmark measures
// the path production actually uses.
function masterPlanRuntimeFor(productionType) {
  const workflow = CreativeWorkflowRegistry.resolveAlias(productionType);
  if (workflow?.executor === "TEMPORAL") {
    return { runtime: CreativeTemporalMasterPlanRuntime, executor: "TEMPORAL" };
  }
  return { runtime: CreativeMasterPlanRuntime, executor: "UNIVERSAL" };
}

async function runCase(inputFixture) {
  const context = await sourceContext(inputFixture);
  const benchmarkFixture = context.fixture;
  const { runtime, executor } = masterPlanRuntimeFor(
    benchmarkFixture.production_type,
  );

  const master = await runtime.create({
    organization_id: benchmarkFixture.organization_id,
    mission: context.mission,
    project: context.project,
    brief: context.brief,
    assets: context.assets,
  });

  // The temporal runtime does not return the capability context, so it is resolved
  // here whenever the master did not supply one. Passing undefined would leave the
  // tribunal with no enabled service and reject every production step it reviewed.
  const capabilities =
    master.available_production_capabilities ||
    (await CreativeMasterPlanRuntime.availableProductionCapabilities(
      benchmarkFixture.organization_id,
    )).capabilities;

  let reviewed;
  let tribunalRejected = false;
  let tribunalError = null;

  try {
    reviewed = await CreativeDynamicTribunalRuntime.review({
      organization_id: benchmarkFixture.organization_id,
      creative_mission_id: context.mission.id,
      creative_project_id: context.project.id,
      mission: context.mission,
      project: context.project,
      brief: context.brief,
      assets: context.assets,
      available_capabilities: capabilities,
      master,
    });
  } catch (error) {
    if (!String(error?.message || "").startsWith("CREATIVE_DYNAMIC_TRIBUNAL_REJECTED:")) {
      throw error;
    }
    tribunalRejected = true;
    tribunalError = error;
    reviewed = error.rejected_master || rejectedMaster(master, error.tribunal);
  }

  const caseResult = scoringCase(benchmarkFixture, reviewed);
  return {
    case_result: caseResult,
    score: publicScore(caseResult),
    execution: {
      organization_id: benchmarkFixture.organization_id,
      source_project_id: benchmarkFixture.source_project_id,
      source_asset_ids: context.assets.map((asset) => asset.id),
      reasoning_provider_calls_executed: true,
      media_generation_executed: false,
      publication_executed: false,
      production_graph_created: false,
      production_task_created: false,
      tribunal_rejected: tribunalRejected,
      tribunal_error: tribunalError?.message || null,
      provider: reviewed.provider || master.provider || null,
      model: reviewed.model || master.model || null,
      master_usage: master.usage || null,
      master_billing: master.billing || null,
      tribunal_billing: reviewed.tribunal_billing || null,
      repair_billing: reviewed.repair_billing || null,
    },
  };
}

function normalizeSubmittedCases(cases = [], fixtures = []) {
  if (!Array.isArray(cases)) {
    throw new Error("CREATIVE_BENCHMARK_CASES_REQUIRED");
  }
  if (!Array.isArray(fixtures) || !fixtures.length) {
    throw new Error("CREATIVE_BENCHMARK_FIXTURES_REQUIRED");
  }

  const benchmarkFixtures = fixtures.map(fixture);
  const submitted = new Map(
    cases.map((entry) => [text(entry?.id), entry]),
  );

  if (submitted.size !== benchmarkFixtures.length) {
    throw new Error(
      `CREATIVE_BENCHMARK_REQUIRES_${benchmarkFixtures.length}_CASES`,
    );
  }

  return benchmarkFixtures.map((benchmarkFixture) => {
    const entry = submitted.get(benchmarkFixture.id);
    if (!entry?.master_plan?.plan) {
      throw new Error(
        `CREATIVE_BENCHMARK_CASE_RESULT_REQUIRED:${benchmarkFixture.id}`,
      );
    }
    return {
      id: benchmarkFixture.id,
      label: benchmarkFixture.label,
      benchmark: benchmarkFixture.benchmark,
      master_plan: {
        plan: scoringPlan(entry.master_plan.plan),
      },
    };
  });
}

function evaluate(cases = [], fixtures = []) {
  const normalized = normalizeSubmittedCases(cases, fixtures);
  return evaluateCreativeWorldClassBenchmark({ cases: normalized });
}

export const CreativeWorldClassLiveBenchmarkRuntime = Object.freeze({
  runCase,
  evaluate,
});
