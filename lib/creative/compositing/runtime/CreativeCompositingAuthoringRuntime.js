import {
  CreativeCompositingRuntime,
} from "@/lib/creative/compositing/runtime/CreativeCompositingRuntime";

const CONTRACT = "AVANTIQO_COMPOSITING_AUTHORING_V1";

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

function hasStructured(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(object(value)).length > 0;
}

function authorShot(shot = {}, scene = {}) {
  const compositing = hasStructured(shot.compositing)
    ? shot.compositing
    : scene.compositing || null;
  const result = CreativeCompositingRuntime.author({
    ...shot,
    compositing,
    execution_phase: "PRODUCTION_GRAPH_AUTHORING",
  });

  if (result.status === "BLOCKED") {
    const codes = result.blocking_issues.map((item) => item.code).join(",");
    throw new Error(
      `CREATIVE_COMPOSITING_AUTHORING_BLOCKED:${text(shot.id) || "unknown"}:${codes}`,
    );
  }
  if (result.status !== "READY") return shot;

  return {
    ...shot,
    compositing_contract: result.compositing_contract,
    metadata: {
      ...object(shot.metadata),
      compositing_contract: result.contract,
      compositing_status: result.status,
      compositing_layer_count: result.compositing_contract?.layers?.length || 0,
      compositing_contract_hash: result.compositing_contract?.contract_hash || null,
      compositing_authored_before_materialization: true,
      compositing_provider_neutral: true,
      compositing_provider_prompt_persisted: false,
    },
  };
}

export function buildCreativeCompositingContracts({
  scenes = [],
  shots = [],
  creative_plan = {},
} = {}) {
  const enrichedShots = list(shots).map((shot) =>
    authorShot(shot, sceneFor(shot, scenes)),
  );
  const readyShots = enrichedShots.filter(
    (shot) => shot.metadata?.compositing_status === "READY",
  );
  return {
    scenes,
    shots: enrichedShots,
    creative_plan,
    metadata: {
      compositing_authoring_contract: CONTRACT,
      compositing_runtime_contract: CreativeCompositingRuntime.contract,
      compositing_ready_shot_count: readyShots.length,
      compositing_layer_count: readyShots.reduce(
        (sum, shot) => sum + Number(shot.metadata?.compositing_layer_count || 0),
        0,
      ),
      compositing_provider_neutral: true,
      compositing_authored_before_materialization: true,
      compositing_execution_authorship_forbidden: true,
    },
  };
}

export const CreativeCompositingAuthoringRuntime = Object.freeze({
  build: buildCreativeCompositingContracts,
  contract: CONTRACT,
  compositing_contract: CreativeCompositingRuntime.contract,
  execution_authorship_forbidden: true,
  provider_neutral: true,
});
