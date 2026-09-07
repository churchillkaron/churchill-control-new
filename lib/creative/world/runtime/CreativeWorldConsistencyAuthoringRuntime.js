import { CreativeWorldConsistencyRuntime } from "@/lib/creative/world/runtime/CreativeWorldConsistencyRuntime";

const CONTRACT = "AVANTIQO_WORLD_CONSISTENCY_AUTHORING_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function sceneFor(shot = {}, scenes = []) {
  return list(scenes).find((scene) => text(scene.id) === text(shot.scene_id)) || {};
}

function authorShot(shot = {}, scene = {}) {
  const result = CreativeWorldConsistencyRuntime.author({ shot, scene });
  if (result.status === "BLOCKED") {
    throw new Error(
      `CREATIVE_WORLD_AUTHORING_BLOCKED:${text(shot.id) || "unknown"}:${result.blocking_issues.map((item) => item.code).join(",")}`,
    );
  }
  if (result.status !== "READY") return shot;
  return {
    ...shot,
    world_consistency_contract: result.world_consistency_contract,
    metadata: {
      ...(shot.metadata || {}),
      world_consistency_contract: result.contract,
      world_consistency_status: result.status,
      world_consistency_world_id: result.world_consistency_contract.world_id,
      world_consistency_contract_hash: result.world_consistency_contract.contract_hash,
      world_consistency_warning_count: result.warnings.length,
      world_consistency_authored_before_materialization: true,
      world_consistency_provider_neutral: true,
      world_consistency_provider_prompt_persisted: false,
    },
  };
}

export function buildCreativeWorldConsistencyContracts({ scenes = [], shots = [], creative_plan = {} } = {}) {
  const enrichedShots = list(shots).map((shot) => authorShot(shot, sceneFor(shot, scenes)));
  return {
    scenes,
    shots: enrichedShots,
    creative_plan,
    metadata: {
      world_consistency_authoring_contract: CONTRACT,
      world_consistency_runtime_contract: CreativeWorldConsistencyRuntime.contract,
      world_consistency_ready_shot_count: enrichedShots.filter((shot) => shot.metadata?.world_consistency_status === "READY").length,
      world_consistency_provider_neutral: true,
      world_consistency_authored_before_materialization: true,
      world_consistency_execution_authorship_forbidden: true,
    },
  };
}

export const CreativeWorldConsistencyAuthoringRuntime = Object.freeze({
  build: buildCreativeWorldConsistencyContracts,
  contract: CONTRACT,
  world_consistency_contract: CreativeWorldConsistencyRuntime.contract,
  execution_authorship_forbidden: true,
  provider_neutral: true,
});
