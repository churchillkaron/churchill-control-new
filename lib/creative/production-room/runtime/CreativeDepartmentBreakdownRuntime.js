export const CREATIVE_DEPARTMENT_BREAKDOWN_CONTRACT =
  "CREATIVE_DEPARTMENT_BREAKDOWN_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value) {
  return String(value ?? "").trim();
}
function actionHeavy(shot = {}) {
  const source = `${text(shot.action)} ${text(shot.subject_motion_choreography?.path)} ${text(shot.camera?.movement_path)}`;
  return /(aerial|pov|stunt|chase|flight|helicopter|aircraft|vehicle|high-speed|high speed|orbit|roll|tracking)/i.test(source);
}
function detailShot(shot = {}) {
  const source = `${text(shot.shot_scale)} ${text(shot.purpose)} ${text(shot.subject)}`;
  return /(macro|detail|insert|close-up|close up|mechanical detail|tactile)/i.test(source);
}
function vfxShot(shot = {}) {
  return Boolean(shot.vfx && (Array.isArray(shot.vfx) ? shot.vfx.length : Object.keys(shot.vfx).length));
}
function unitIdsForShot(shot = {}) {
  const units = ["PRIMARY_UNIT"];
  if (actionHeavy(shot)) units.push("SECOND_UNIT");
  if (/aerial|drone|helicopter|aircraft/i.test(`${text(shot.action)} ${text(shot.camera?.movement_path)}`)) units.push("AERIAL_UNIT");
  if (detailShot(shot)) units.push("INSERT_UNIT");
  if (vfxShot(shot)) units.push("VFX_PLATE_UNIT");
  return [...new Set(units)];
}
export function buildDepartmentBreakdown({ shots = [], take_strategy = {}, role_decisions = {} } = {}) {
  const rows = list(shots);
  const failures = [];
  if (!rows.length) failures.push("DEPARTMENT_BREAKDOWN_SHOTS_REQUIRED");

  const shot_assignments = rows.map((shot, index) => {
    const shotId = text(shot.id) || `shot-${index + 1}`;
    const unit_ids = unitIdsForShot(shot);
    const objective = text(shot.purpose || shot.action);
    if (objective.length < 12) failures.push(`DEPARTMENT_BREAKDOWN_SHOT_PURPOSE_REQUIRED:${shotId}`);
    return {
      shot_id: shotId,
      unit_ids,
      coverage_purpose: objective,
      continuity_keys: list(shot.continuity_invariants),
      subject_identity_key: shot.subject_identity_key || null,
      world_identity_key: shot.world_identity_key || null,
      required_role_ids: Object.entries(role_decisions)
        .filter(([, decision]) => String(decision?.status || "").toUpperCase() === "ACTIVE")
        .map(([roleId]) => roleId),
    };
  });

  const unit_ids = [...new Set(shot_assignments.flatMap((item) => item.unit_ids))];
  const units = unit_ids.map((unit_id) => ({
    unit_id,
    shot_ids: shot_assignments.filter((item) => item.unit_ids.includes(unit_id)).map((item) => item.shot_id),
  }));
  const take_limit = Number(take_strategy.max_takes_per_shot || 0);
  if (!Number.isFinite(take_limit) || take_limit < 1 || take_limit > 6) {
    failures.push("DEPARTMENT_BREAKDOWN_TAKE_LIMIT_REQUIRED");
  }
  for (const assignment of shot_assignments) {
    if (!assignment.continuity_keys.length) {
      failures.push(`DEPARTMENT_BREAKDOWN_CONTINUITY_KEYS_REQUIRED:${assignment.shot_id}`);
    }
  }

  return Object.freeze({
    contract: CREATIVE_DEPARTMENT_BREAKDOWN_CONTRACT,
    passed: failures.length === 0,
    failures: [...new Set(failures)],
    units,
    shot_assignments,
    take_strategy: {
      max_takes_per_shot: take_limit || null,
      variant_budget_rule: take_strategy.variant_budget_rule || null,
      editorial_value_required: true,
    },
    zero_provider_calls: true,
    zero_media_generation: true,
  });
}

export const CreativeDepartmentBreakdownRuntime = Object.freeze({
  contract: CREATIVE_DEPARTMENT_BREAKDOWN_CONTRACT,
  build: buildDepartmentBreakdown,
});
