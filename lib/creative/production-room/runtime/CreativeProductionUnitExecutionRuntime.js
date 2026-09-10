export const CREATIVE_PRODUCTION_UNIT_EXECUTION_CONTRACT =
  "CREATIVE_PRODUCTION_UNIT_EXECUTION_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value) {
  return String(value ?? "").trim();
}

export function buildTakeExecutionIntent({
  shot_id,
  unit_ids = [],
  take_index,
  max_takes_per_shot,
  rehearsal_digest,
  editorial_objective,
  continuity_keys = [],
} = {}) {
  const failures = [];
  const index = Number(take_index);
  const limit = Number(max_takes_per_shot);
  if (!text(shot_id)) failures.push("PRODUCTION_UNIT_SHOT_REQUIRED");
  if (!list(unit_ids).length) failures.push("PRODUCTION_UNIT_ASSIGNMENT_REQUIRED");
  if (!Number.isInteger(limit) || limit < 1 || limit > 6) failures.push("PRODUCTION_UNIT_TAKE_LIMIT_INVALID");
  if (!Number.isInteger(index) || index < 1 || index > limit) failures.push("PRODUCTION_UNIT_TAKE_INDEX_INVALID");
  if (!text(rehearsal_digest)) failures.push("PRODUCTION_UNIT_REHEARSAL_DIGEST_REQUIRED");
  if (text(editorial_objective).length < 20) failures.push("PRODUCTION_UNIT_EDITORIAL_OBJECTIVE_REQUIRED");
  if (!list(continuity_keys).length) failures.push("PRODUCTION_UNIT_CONTINUITY_KEYS_REQUIRED");
  const take_id = text(shot_id) && Number.isInteger(index)
    ? `take:${shot_id}:${index}`
    : null;
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_UNIT_EXECUTION_CONTRACT,
    passed: failures.length === 0,
    failures: [...new Set(failures)],
    shot_id: text(shot_id) || null,
    unit_ids: [...new Set(list(unit_ids).map(text).filter(Boolean))],
    take_id,
    take_index: Number.isInteger(index) ? index : null,
    max_takes_per_shot: Number.isInteger(limit) ? limit : null,
    rehearsal_digest: text(rehearsal_digest) || null,
    editorial_objective: text(editorial_objective) || null,
    continuity_keys: list(continuity_keys).map(text).filter(Boolean),
    dailies_approval_required: true,
    provider_execution_authority: false,
  });
}

export function bindTaskTakeExecutionIntent({ task = {}, take_index, editorial_objective } = {}) {
  const requirements = task.input?.requirements || {};
  const menu = requirements.planned_take_menu || {};
  const gate = requirements.production_room_entry_gate || {};
  if (menu.contract !== "CREATIVE_PLANNED_TAKE_MENU_V1") {
    throw new Error("PRODUCTION_UNIT_PLANNED_TAKE_MENU_REQUIRED");
  }
  const selectedTakeId = `take:${menu.shot_id}:${Number(take_index)}`;
  if (!list(menu.planned_take_ids).includes(selectedTakeId)) {
    throw new Error("PRODUCTION_UNIT_TAKE_NOT_IN_PLANNED_MENU");
  }
  if (gate.passed !== true || !text(gate.rehearsal_digest)) {
    throw new Error("PRODUCTION_UNIT_VIRTUAL_REHEARSAL_GATE_REQUIRED");
  }
  const intent = buildTakeExecutionIntent({
    shot_id: menu.shot_id,
    unit_ids: menu.unit_ids,
    take_index,
    max_takes_per_shot: menu.max_takes_per_shot,
    rehearsal_digest: gate.rehearsal_digest,
    editorial_objective,
    continuity_keys: menu.continuity_keys,
  });
  if (!intent.passed) throw new Error(`PRODUCTION_UNIT_TAKE_INTENT_INVALID:${intent.failures.join(",")}`);
  return {
    ...task,
    input: {
      ...(task.input || {}),
      requirements: {
        ...requirements,
        take_execution_intent: intent,
      },
    },
    metadata: {
      ...(task.metadata || {}),
      selected_take_id: intent.take_id,
      production_unit_ids: intent.unit_ids,
      take_selection_reason: intent.editorial_objective,
    },
  };
}

export const CreativeProductionUnitExecutionRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_UNIT_EXECUTION_CONTRACT,
  build: buildTakeExecutionIntent,
  bindTask: bindTaskTakeExecutionIntent,
});
