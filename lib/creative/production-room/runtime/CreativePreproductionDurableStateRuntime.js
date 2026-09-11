import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

export const CREATIVE_PREPRODUCTION_DURABLE_STATE_CONTRACT =
  "CREATIVE_PREPRODUCTION_DURABLE_STATE_V1";
export const CREATIVE_PREPRODUCTION_METADATA_KEY = "creative_preproduction_state";

function text(value) {
  return String(value ?? "").trim();
}

function scopeMatches(state = {}, context = {}, masterPlanDigest = null) {
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
    reports_by_stage: state.reports_by_stage || {},
    production_room_stage_inputs: state.production_room_stage_inputs || {},
    specialist_wave_audit: state.specialist_wave_audit || [],
    preproduction_continuation: state.preproduction_continuation || null,
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
