import {
  CreativeSimulationRuntime,
} from "@/lib/creative/simulation/runtime/CreativeSimulationRuntime";

const CONTRACT = "AVANTIQO_SIMULATION_AUTHORING_V1";

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

function valuePresent(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(text(value));
}

function authorShot(shot = {}, scene = {}) {
  const simulation = valuePresent(shot.simulation)
    ? shot.simulation
    : scene.simulation || null;
  const result = CreativeSimulationRuntime.author({
    ...shot,
    simulation,
    vfx: valuePresent(shot.vfx) ? shot.vfx : scene.vfx || null,
    continuity: {
      ...object(scene.continuity),
      ...object(shot.continuity),
    },
    execution_phase: "PRODUCTION_GRAPH_AUTHORING",
  });

  if (result.status === "BLOCKED") {
    const codes = result.blocking_issues.map((item) => item.code).join(",");
    throw new Error(
      `CREATIVE_SIMULATION_AUTHORING_BLOCKED:${text(shot.id) || "unknown"}:${codes}`,
    );
  }

  if (result.status !== "READY") return shot;

  return {
    ...shot,
    simulation,
    simulation_contract: result.simulation_contract,
    metadata: {
      ...object(shot.metadata),
      simulation_contract: result.contract,
      simulation_status: result.status,
      simulation_count: result.simulation_contract?.simulations?.length || 0,
      simulation_warning_count: result.warnings.length,
      simulation_authored_before_materialization: true,
      simulation_provider_neutral: true,
      simulation_provider_prompt_persisted: false,
    },
  };
}

export function buildCreativeSimulationContracts({
  scenes = [],
  shots = [],
  creative_plan = {},
} = {}) {
  const enrichedShots = list(shots).map((shot) =>
    authorShot(shot, sceneFor(shot, scenes)),
  );
  const readyShots = enrichedShots.filter(
    (shot) => shot.metadata?.simulation_status === "READY",
  );
  return {
    scenes,
    shots: enrichedShots,
    creative_plan,
    metadata: {
      simulation_authoring_contract: CONTRACT,
      simulation_runtime_contract: CreativeSimulationRuntime.contract,
      simulation_ready_shot_count: readyShots.length,
      simulation_count: readyShots.reduce(
        (sum, shot) => sum + Number(shot.metadata?.simulation_count || 0),
        0,
      ),
      simulation_provider_neutral: true,
      simulation_authored_before_materialization: true,
      simulation_execution_authorship_forbidden: true,
      simulation_can_be_derived_from_vfx_dependency: true,
    },
  };
}

export const CreativeSimulationAuthoringRuntime = Object.freeze({
  build: buildCreativeSimulationContracts,
  contract: CONTRACT,
  simulation_contract: CreativeSimulationRuntime.contract,
  execution_authorship_forbidden: true,
  provider_neutral: true,
});
