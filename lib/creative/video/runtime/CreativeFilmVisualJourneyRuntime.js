const CONTRACT = "CREATIVE_FILM_VISUAL_JOURNEY_V1";
const SHOT_CONTRACT = "CREATIVE_SHOT_VISUAL_JOURNEY_STATE_V1";

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 50) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(n) { return Math.max(0, Math.min(100, Number(n) || 0)); }

function derivedScaleBand(shot = {}, index = 0) {
  const semantic = [
    shot.title,
    shot.subject,
    shot.action,
    shot.purpose,
    shot.scene_title,
    shot.scene_objective,
    shot.state_change,
  ].map(text).join(" ").toLowerCase();
  const beat = Math.max(0, Number(shot.__journey_shot_index ?? shot.shot_number ?? index + 1) - 1);

  if (/satellite|city|grid|global|world|landscape|horizon|aerial|orbital/.test(semantic)) {
    return ["WORLD", "CONTEXT", "INTIMATE", "WORLD"][beat % 4];
  }
  if (/leaf|crack|fracture|detail|surface|tool|hand|eye|ripple/.test(semantic)) {
    return ["MICRO", "INTIMATE", "CONTEXT", "HUMAN"][beat % 4];
  }
  if (/child|manager|person|human|worker|guest|artist|performer|decision/.test(semantic)) {
    return ["CONTEXT", "HUMAN", "INTIMATE", "MICRO", "HUMAN", "INTIMATE"][beat % 6];
  }
  if (/water|river|forest|sea|environment|building|factory|rig/.test(semantic)) {
    return ["WORLD", "CONTEXT", "INTIMATE", "WORLD"][beat % 4];
  }
  return ["CONTEXT", "HUMAN", "INTIMATE", "WORLD"][index % 4];
}

function scaleBand(shot = {}, index = 0) {
  const framing = text(shot.camera?.framing);
  const genericFallback =
    !text(shot.shot_scale) &&
    /medium close framing that preserves face, hands and decision context/i.test(framing);
  const cameraDistance = text(shot.camera?.camera_distance);
  const cameraAngle = text(shot.camera?.angle);
  if (genericFallback || (!text(shot.shot_scale) && !framing && !cameraDistance && !cameraAngle)) {
    return derivedScaleBand(shot, index);
  }

  const src = `${text(shot.shot_scale)} ${framing} ${cameraDistance} ${cameraAngle}`.toLowerCase();
  if (/macro|extreme close|ecu|detail|insert/.test(src)) return "MICRO";
  if (/close|portrait|cu\b/.test(src)) return "INTIMATE";
  if (/medium|waist|mcu/.test(src)) return "HUMAN";
  if (/wide|establish|aerial|drone|master|landscape/.test(src)) return "WORLD";
  return derivedScaleBand(shot, index);
}

function paletteFor(shot = {}) {
  const explicit = list(shot.look_development?.palette);
  if (explicit.length) return explicit;
  const colour = text(shot.lighting?.colour || shot.lighting?.color);
  return colour ? [colour] : ["NATURAL_MOTIVATED"];
}
function stateFor(shot = {}, index = 0, total = 1) {
  const energy = clamp(finite(shot.energy_level, 50));
  const tempo = text(shot.tempo_role).toUpperCase() || "HOLD";
  const progress = total > 1 ? index / (total - 1) : 0;
  const scale = scaleBand(shot, index);
  return Object.freeze({
    contract: SHOT_CONTRACT,
    shot_id: shot.id || `shot-${index + 1}`,
    index,
    progress: Number(progress.toFixed(4)),
    energy_level: energy,
    tempo_role: tempo,
    scale_band: scale,
    palette: paletteFor(shot),
    contrast_intent: text(shot.lighting?.contrast || shot.look_development?.contrast_curve) || "MOTIVATED_CINEMATIC_CONTRAST",
    exposure_intent: text(shot.lighting?.exposure_intent || shot.look_development?.exposure_philosophy) || "PROTECT_HIGHLIGHTS_AND_PRESERVE_SHADOW_DETAIL",
    saturation_intent: text(shot.look_development?.saturation_hierarchy) || "SUBJECT_AND_STORY_PRIORITY",
    visual_density: text(shot.visual_density || shot.production_design?.visual_density) || (energy >= 75 ? "DENSE_CONTROLLED" : energy <= 30 ? "SPARSE" : "BALANCED"),
    silence_state: tempo === "SILENCE" || shot.black_frame === true,
  });
}

function authoritativePlanShotMap(creativePlan = {}) {
  const map = new Map();
  list(creativePlan.scenes).forEach((scene, sceneIndex) => {
    list(scene.shots).forEach((shot, shotIndex) => {
      const id = text(shot.id);
      if (!id) return;
      map.set(id, {
        ...shot,
        scene_title: scene.title || null,
        scene_objective: scene.objective || null,
        state_change: scene.state_change || null,
        __journey_scene_index: sceneIndex + 1,
        __journey_shot_index: shotIndex + 1,
      });
    });
  });
  return map;
}

function journeyShot(row = {}, planShots = new Map(), index = 0) {
  const planShotId = text(
    row.metadata?.master_plan_shot_id ||
    row.master_plan_shot_id ||
    row.plan_shot_id,
  );
  const authored = planShots.get(planShotId) || {};
  return {
    ...row,
    ...authored,
    id: row.id || authored.id || `shot-${index + 1}`,
    camera: { ...object(row.camera), ...object(authored.camera) },
    lighting: { ...object(row.lighting), ...object(authored.lighting) },
    production_design: {
      ...object(row.production_design),
      ...object(authored.production_design),
    },
    look_development: {
      ...object(row.look_development),
      ...object(authored.look_development),
    },
    metadata: { ...object(row.metadata), ...object(authored.metadata) },
    __journey_shot_index:
      authored.__journey_shot_index ||
      Number(row.shot_number || 0) ||
      index + 1,
  };
}

function latestShotRow(left = {}, right = {}) {
  const leftVersion = Number(left.version_number || 0);
  const rightVersion = Number(right.version_number || 0);
  if (rightVersion !== leftVersion) return rightVersion > leftVersion ? right : left;
  const leftUpdated = Date.parse(left.updated_at || left.created_at || 0);
  const rightUpdated = Date.parse(right.updated_at || right.created_at || 0);
  return rightUpdated > leftUpdated ? right : left;
}

function canonicalJourneyRows(shots = [], planShots = new Map()) {
  const sourceRows = list(shots);
  if (!planShots.size) return sourceRows;

  const rowByPlanShotId = new Map();
  for (const row of sourceRows) {
    const planShotId = text(
      row.metadata?.master_plan_shot_id ||
      row.master_plan_shot_id ||
      row.plan_shot_id,
    );
    if (!planShotId || !planShots.has(planShotId)) continue;
    const existing = rowByPlanShotId.get(planShotId);
    rowByPlanShotId.set(planShotId, existing ? latestShotRow(existing, row) : row);
  }

  return [...planShots.entries()].map(([planShotId, authored]) =>
    rowByPlanShotId.get(planShotId) || {
      id: planShotId,
      metadata: { master_plan_shot_id: planShotId },
      ...authored,
    },
  );
}

export function buildFilmVisualJourney({ shots = [], scenes = [], creative_plan = {} } = {}) {
  const planShots = authoritativePlanShotMap(creative_plan);
  const rows = canonicalJourneyRows(shots, planShots)
    .map((shot, index) => journeyShot(shot, planShots, index));
  const states = rows.map((shot, index) => stateFor(shot, index, rows.length));
  return Object.freeze({
    contract: CONTRACT,
    version: 1,
    source: "EXISTING_LOOK_DEVELOPMENT_ENERGY_SCALE_AND_SCENE_DIRECTION",
    shot_states: states,
    film_rules: {
      color_changes_must_follow_story_state: true,
      repeated_scale_without_story_reason_forbidden: true,
      flat_energy_curve_forbidden: rows.length >= 6,
      visual_silence_is_authored_not_empty: true,
      payoff_must_have_distinct_visual_state: rows.length >= 3,
      finishing_must_preserve_preproduction_color_script: true,
    },
    provider_may_flatten_visual_progression: false,
    release_blocking: true,
    scene_count: list(scenes).length,
    creative_device: object(creative_plan.concept?.creative_device || creative_plan.creative_device),
  });
}
export function evaluateFilmVisualJourney(journey = {}) {
  const failures = [];
  const states = list(journey.shot_states);
  if (journey.contract !== CONTRACT) failures.push("FILM_VISUAL_JOURNEY_CONTRACT_REQUIRED");
  if (!states.length) failures.push("FILM_VISUAL_JOURNEY_SHOTS_REQUIRED");
  if (journey.release_blocking !== true) failures.push("FILM_VISUAL_JOURNEY_RELEASE_GATE_REQUIRED");
  if (journey.provider_may_flatten_visual_progression !== false) failures.push("FILM_VISUAL_JOURNEY_PROVIDER_AUTHORITY_INVALID");
  if (states.length >= 3) {
    const scales = states.map((s) => s.scale_band);
    if (new Set(scales).size < 2) failures.push("FILM_VISUAL_JOURNEY_SCALE_TOO_FLAT");
    let run = 1;
    for (let i = 1; i < scales.length; i += 1) {
      run = scales[i] === scales[i - 1] ? run + 1 : 1;
      if (run > 3) failures.push("FILM_VISUAL_JOURNEY_REPEATED_SCALE_RUN");
    }
    const energies = states.map((s) => finite(s.energy_level));
    if (states.length >= 6 && Math.max(...energies) - Math.min(...energies) < 25) failures.push("FILM_VISUAL_JOURNEY_ENERGY_TOO_FLAT");
    const first = states[0];
    const last = states[states.length - 1];
    const distinctPayoff = first.scale_band !== last.scale_band || first.contrast_intent !== last.contrast_intent || first.visual_density !== last.visual_density || Math.abs(first.energy_level - last.energy_level) >= 15;
    if (!distinctPayoff) failures.push("FILM_VISUAL_JOURNEY_PAYOFF_NOT_DISTINCT");
  }
  return Object.freeze({ contract: "CREATIVE_FILM_VISUAL_JOURNEY_GATE_V1", passed: failures.length === 0, failures: [...new Set(failures)] });
}

export function shotVisualJourneyState(journey = {}, shotId = null) {
  const states = list(journey.shot_states);
  const match = states.find((state) => text(state.shot_id) === text(shotId));
  return match || null;
}

export const CreativeFilmVisualJourneyRuntime = Object.freeze({
  contract: CONTRACT,
  shotContract: SHOT_CONTRACT,
  build: buildFilmVisualJourney,
  evaluate: evaluateFilmVisualJourney,
  shotState: shotVisualJourneyState,
});
