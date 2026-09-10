function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function shots(plan = {}) {
  return list(plan.scenes).flatMap((scene) => list(scene.shots));
}

function duration(plan = {}) {
  const values = list(plan.deliverables)
    .map((item) => Number(item?.output_spec?.duration_seconds))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function hasData(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value && typeof value === "object" ? Object.keys(value).length > 0 : Boolean(text(value));
}
function mechanicalSubject(shot = {}) {
  const source = `${text(shot.subject_class)} ${text(shot.mechanical_truth)}`.toLowerCase();
  return /(vehicle|car|aircraft|helicopter|rotor|engine|machine|machinery|mechanism|rig|crane|train|ship|boat|robot|tool|industrial)/.test(source);
}

function generatedOrVfxShot(shot = {}) {
  return hasData(shot.vfx) || hasData(shot.effects) ||
    /generate|synthetic|cgi|cg\b|digital double|replace|extend|inpaint/i.test(
      `${text(shot.source_mode)} ${text(shot.production_method)} ${text(shot.purpose)}`,
    );
}

function integrationShot(shot = {}) {
  const vfx = object(shot.vfx);
  return list(vfx.compositing).length > 0 || list(vfx.cleanup).length > 0 ||
    list(vfx.integration).length > 0 || hasData(shot.source_bindings) ||
    /composit|matchmove|track|roto|plate|screen replacement/i.test(JSON.stringify(vfx));
}

function namedGeography(shot = {}) {
  const claim = text(shot.geography_claim);
  return Boolean(claim && claim.toUpperCase() !== "NONE");
}
export function requiredEliteFilmDepartments(plan = {}) {
  const allShots = shots(plan);
  const seconds = duration(plan);
  const required = new Set();

  if (allShots.some((shot) => hasData(shot.production_design))) required.add("production_designer");
  if (allShots.some(namedGeography)) required.add("location_production_supervisor");
  if (plan.temporal_contract?.human_place_patience_required === true) required.add("human_place_truth_director");
  if ((seconds ?? 0) >= 30 || allShots.length >= 4 || allShots.some((shot) => hasData(shot.vfx))) {
    required.add("previsualization_supervisor");
    required.add("post_production_supervisor");
    required.add("color_di_supervisor");
    required.add("sound_design_supervisor");
    required.add("mix_finishing_engineer");
  }
  if (allShots.some(generatedOrVfxShot)) {
    required.add("cg_asset_supervisor");
    required.add("compositing_supervisor");
  }
  if (allShots.some(integrationShot)) {
    required.add("tracking_roto_supervisor");
    required.add("compositing_supervisor");
  }
  if (allShots.some(mechanicalSubject)) {
    required.add("simulation_physics_supervisor");
    required.add("action_motion_supervisor");
  }
  const actionHeavy = allShots.filter((shot) => {
    const source = `${text(shot.subject_motion_choreography?.path)} ${text(shot.action)} ${text(shot.camera?.movement_path)}`;
    return /(aerial|pov|stunt|chase|jump|fall|flight|vehicle|helicopter|aircraft|high-speed|high speed|360|roll|orbit)/i.test(source);
  }).length >= 2;
  if (actionHeavy) required.add("second_unit_director");
  if (allShots.some((shot) => String(shot.hero_asset_truth?.mode || "").toUpperCase() === "REFERENCE_GROUNDED_CLASS")) {
    required.add("technical_subject_supervisor");
  }
  if (allShots.some((shot) => {
    const mode = String(shot.product_capability_demonstration?.mode || "").toUpperCase();
    return mode && mode !== "NOT_APPLICABLE";
  })) {
    required.add("product_capability_director");
  }

  return [...required].sort();
}

export function eliteFilmDepartmentActivationFailures(plan = {}) {
  const required = requiredEliteFilmDepartments(plan);
  const decisions = object(plan.role_decisions);
  return required
    .filter((roleId) => text(decisions[roleId]?.status).toUpperCase() !== "ACTIVE")
    .map((roleId) => `ELITE_FILM_DEPARTMENT_REQUIRED:${roleId}`);
}
