import {
  CreativeHumanPerformanceRuntime,
} from "@/lib/creative/performance/runtime/CreativeHumanPerformanceRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function sceneFor(shot = {}, scenes = []) {
  return list(scenes).find((scene) => text(scene.id) === text(shot.scene_id)) || {};
}

function authorShot(shot = {}, scene = {}) {
  const result = CreativeHumanPerformanceRuntime.author({
    ...shot,
    actors: list(shot.actors).length ? shot.actors : scene.actors || [],
    continuity: {
      ...object(scene.continuity),
      ...object(shot.continuity),
    },
    execution_phase: "PRODUCTION_GRAPH_AUTHORING",
  });

  if (result.status === "BLOCKED") {
    const codes = result.blocking_issues.map((item) => item.code).join(",");
    throw new Error(
      `CREATIVE_HUMAN_PERFORMANCE_AUTHORING_BLOCKED:${text(shot.id) || "unknown"}:${codes}`,
    );
  }

  if (result.status !== "READY") return shot;

  return {
    ...shot,
    human_performance: result.human_performance,
    metadata: {
      ...object(shot.metadata),
      human_performance_contract: result.contract,
      human_performance_status: result.status,
      human_performance_action_class:
        result.human_performance?.action_class || null,
      human_performance_warning_count: result.warnings.length,
      human_performance_authored_before_materialization: true,
      human_performance_provider_neutral: true,
    },
  };
}

export function buildCreativeHumanPerformanceContracts({
  scenes = [],
  shots = [],
  creative_plan = {},
} = {}) {
  const enrichedShots = list(shots).map((shot) =>
    authorShot(shot, sceneFor(shot, scenes)),
  );

  const readyCount = enrichedShots.filter(
    (shot) => shot.metadata?.human_performance_status === "READY",
  ).length;

  return {
    scenes,
    shots: enrichedShots,
    creative_plan,
    metadata: {
      human_performance_authoring_contract:
        "AVANTIQO_HUMAN_PERFORMANCE_AUTHORING_V1",
      human_performance_runtime_contract:
        CreativeHumanPerformanceRuntime.contract,
      human_performance_ready_shot_count: readyCount,
      human_performance_provider_neutral: true,
      human_performance_authored_before_materialization: true,
    },
  };
}

export const CreativeHumanPerformanceAuthoringRuntime = Object.freeze({
  build: buildCreativeHumanPerformanceContracts,
  contract: "AVANTIQO_HUMAN_PERFORMANCE_AUTHORING_V1",
  human_performance_contract: CreativeHumanPerformanceRuntime.contract,
  execution_authorship_forbidden: true,
});
