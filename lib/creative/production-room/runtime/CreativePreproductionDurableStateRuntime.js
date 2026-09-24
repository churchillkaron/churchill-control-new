import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

export const CREATIVE_PREPRODUCTION_DURABLE_STATE_CONTRACT =
  "CREATIVE_PREPRODUCTION_DURABLE_STATE_V1";
export const CREATIVE_PREPRODUCTION_METADATA_KEY = "creative_preproduction_state";

function text(value) {
  return String(value ?? "").trim();
}

function scopeMatches(state = {}, context = {}, masterPlanDigest = null) {
  if (!text(masterPlanDigest)) return false;
  return state.contract === CREATIVE_PREPRODUCTION_DURABLE_STATE_CONTRACT &&
    state.organization_id === context.organization_id &&
    state.creative_mission_id === context.creative_mission_id &&
    state.creative_project_id === context.creative_project_id &&
    text(state.master_plan_digest) === text(masterPlanDigest);
}

export function readPreproductionDurableState({ project = {}, context = {}, master_plan_digest = null } = {}) {
  const state = project.metadata?.[CREATIVE_PREPRODUCTION_METADATA_KEY] || null;
  return state && scopeMatches(state, context, master_plan_digest) ? state : null;
}

function compactContinuation(value = null) {
  if (!value || typeof value !== "object") return null;
  return {
    contract: value.contract || null,
    action: value.action || null,
    stage_id: value.stage_id || null,
    blocker: value.blocker || null,
    advances: Array.isArray(value.advances) ? value.advances : [],
    production_entry_gate: value.production_entry_gate || null,
    provider_calls_executed: Number(value.provider_calls_executed || 0),
    media_generation_executed: value.media_generation_executed === true,
  };
}

function sealedStageIds(pipeline = {}) {
  return new Set(
    (Array.isArray(pipeline?.stages) ? pipeline.stages : [])
      .filter((stage) => stage?.status === "SEALED")
      .map((stage) => stage.id)
      .filter(Boolean),
  );
}

function compactWorkingStateByStage(value = {}, pipeline = {}) {
  const sealed = sealedStageIds(pipeline);
  return Object.fromEntries(
    Object.entries(value || {}).filter(([stageId]) => !sealed.has(stageId)),
  );
}

export async function persistPreproductionDurableState({ context = {}, master_plan_digest = null, state = {} } = {}) {
  const current = await CreativeProjectRuntime.get(context.creative_project_id);
  if (!current || current.organization_id !== context.organization_id) throw new Error("Creative project not found");
  const durable = {
    contract: CREATIVE_PREPRODUCTION_DURABLE_STATE_CONTRACT,
    organization_id: context.organization_id,
    creative_mission_id: context.creative_mission_id,
    creative_project_id: context.creative_project_id,
    master_plan_digest: text(master_plan_digest) || null,
    persisted_at: new Date().toISOString(),
    production_room_pipeline: state.production_room_pipeline || null,
    reports_by_stage: compactWorkingStateByStage(
      state.reports_by_stage || {},
      state.production_room_pipeline || {},
    ),
    production_room_stage_inputs: compactWorkingStateByStage(
      state.production_room_stage_inputs || {},
      state.production_room_pipeline || {},
    ),
    specialist_wave_audit: state.specialist_wave_audit || [],
    preproduction_continuation: compactContinuation(state.preproduction_continuation),
  };
  return CreativeProjectRuntime.update(current.id, {
    metadata: { ...(current.metadata || {}), [CREATIVE_PREPRODUCTION_METADATA_KEY]: durable },
  });
}

export async function clearPreproductionDurableState(context = {}) {
  const current = await CreativeProjectRuntime.get(context.creative_project_id);
  if (!current || current.organization_id !== context.organization_id) return null;
  if (!current.metadata?.[CREATIVE_PREPRODUCTION_METADATA_KEY]) return current;
  const metadata = { ...(current.metadata || {}) };
  delete metadata[CREATIVE_PREPRODUCTION_METADATA_KEY];
  return CreativeProjectRuntime.update(current.id, { metadata });
}

export const CreativePreproductionDurableStateRuntime = Object.freeze({
  contract: CREATIVE_PREPRODUCTION_DURABLE_STATE_CONTRACT,
  read: readPreproductionDurableState,
  persist: persistPreproductionDurableState,
  clear: clearPreproductionDurableState,
});
