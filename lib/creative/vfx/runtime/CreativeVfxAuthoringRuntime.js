import {
  CreativeVfxRuntime,
} from "@/lib/creative/vfx/runtime/CreativeVfxRuntime";

const CONTRACT = "AVANTIQO_VFX_AUTHORING_V1";

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
  const result = CreativeVfxRuntime.author({
    ...shot,
    vfx: Object.keys(object(shot.vfx)).length || Array.isArray(shot.vfx)
      ? shot.vfx
      : scene.vfx || null,
    continuity: {
      ...object(scene.continuity),
      ...object(shot.continuity),
    },
    execution_phase: "PRODUCTION_GRAPH_AUTHORING",
  });

  if (result.status === "BLOCKED") {
    const codes = result.blocking_issues.map((item) => item.code).join(",");
    throw new Error(
      `CREATIVE_VFX_AUTHORING_BLOCKED:${text(shot.id) || "unknown"}:${codes}`,
    );
  }

  if (result.status !== "READY") return shot;

  return {
    ...shot,
    vfx_contract: result.vfx_contract,
    metadata: {
      ...object(shot.metadata),
      vfx_contract: result.contract,
      vfx_status: result.status,
      vfx_effect_count: result.vfx_contract?.effects?.length || 0,
      vfx_warning_count: result.warnings.length,
      vfx_authored_before_materialization: true,
      vfx_provider_neutral: true,
      vfx_provider_prompt_persisted: false,
    },
  };
}

export function buildCreativeVfxContracts({
  scenes = [],
  shots = [],
  creative_plan = {},
} = {}) {
  const enrichedShots = list(shots).map((shot) =>
    authorShot(shot, sceneFor(shot, scenes)),
  );
  const readyShots = enrichedShots.filter(
    (shot) => shot.metadata?.vfx_status === "READY",
  );
  return {
    scenes,
    shots: enrichedShots,
    creative_plan,
    metadata: {
      vfx_authoring_contract: CONTRACT,
      vfx_runtime_contract: CreativeVfxRuntime.contract,
      vfx_ready_shot_count: readyShots.length,
      vfx_effect_count: readyShots.reduce(
        (sum, shot) => sum + Number(shot.metadata?.vfx_effect_count || 0),
        0,
      ),
      vfx_provider_neutral: true,
      vfx_authored_before_materialization: true,
      vfx_execution_authorship_forbidden: true,
    },
  };
}

export const CreativeVfxAuthoringRuntime = Object.freeze({
  build: buildCreativeVfxContracts,
  contract: CONTRACT,
  vfx_contract: CreativeVfxRuntime.contract,
  execution_authorship_forbidden: true,
  provider_neutral: true,
});
