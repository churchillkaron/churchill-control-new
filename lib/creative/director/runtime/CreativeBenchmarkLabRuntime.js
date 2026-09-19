export const CREATIVE_BENCHMARK_LAB_CONTRACT = "CREATIVE_BENCHMARK_LAB_V1";
export const CREATIVE_BENCHMARK_DELTA_CONTRACT = "CREATIVE_BENCHMARK_DELTA_V1";

const STUDY_DIMENSIONS = Object.freeze([
  "narrative",
  "editing",
  "cinematography",
  "visual_beauty",
  "humanity",
  "place",
  "sound",
  "production_craft",
]);
const GREATNESS_DIMENSIONS = Object.freeze([
  "cinematic_mystery",
  "human_consequence",
  "iconic_imagery",
  "scale_contrast",
  "editorial_sophistication",
  "sound_evolution",
  "place_causality",
  "emotional_power",
  "reveal_originality",
]);
const GENERIC_REVEAL = /(glowing|luminous).{0,40}(globe|world|map|wave.{0,30}(logo|brand))|dots?.{0,30}(connect|network)|particles?.{0,40}(logo|brand)|light.{0,30}wave.{0,30}(logo|brand)|hologram|digital network/i;
const EXPLAINER = /(dashboard|q[1-4]\s*20\d\d|performance review|quarterly report|inventory\s*-|cash flow|visible business data|screen showing)/i;
const LARGE_SCALE = /(aerial|drone|city|skyline|landscape|factory|port|airport|ocean|mountain|forest|rig|warehouse aisle|architecture|crowd|train|ship|aircraft|world)/i;
const MICRO_SCALE = /(macro|extreme close|ecu|finger|eye|hand|texture|surface|tip|detail|grain|material)/i;
const CONSEQUENCE = /(changes?|completes?|arrives?|departs?|opens?|closes?|receives?|releases?|hands? over|loads?|unloads?|serves?|resolves?|approves?|rejects?|lands?|takes off|delivers?)/i;

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value ?? "").trim(); }
function uniq(values = []) { return [...new Set(values.filter(Boolean))]; }
function flattenShots(plan = {}) {
  return list(plan.scenes).flatMap((scene) => list(scene.shots).map((shot) => ({ ...shot, scene_id: shot.scene_id || scene.id, scene_location: shot.scene_location || scene.location })));
}
function prose(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(prose).join(" ");
  if (typeof value === "object") return Object.values(value).map(prose).join(" ");
  return String(value);
}
function dimensionScore(studies, dimension) {
  const scores = studies.map((study) => Number(object(study.craft_scores)[dimension])).filter(Number.isFinite);
  return scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
}

export function evaluateBenchmarkStudy({ benchmark_lab = {}, minimum_studies = 3 } = {}) {
  const studies = list(benchmark_lab.studies);
  const failures = [];
  if (benchmark_lab.contract !== CREATIVE_BENCHMARK_LAB_CONTRACT) failures.push("BENCHMARK_LAB_CONTRACT_REQUIRED");
  if (studies.length < minimum_studies) failures.push("BENCHMARK_LAB_MINIMUM_STUDIES_REQUIRED");
  studies.forEach((study, index) => {
    const prefix = `BENCHMARK_STUDY_${index + 1}`;
    if (!text(study.title)) failures.push(`${prefix}_TITLE_REQUIRED`);
    if (!text(study.source_ref || study.source_url || study.evidence_ref)) failures.push(`${prefix}_SOURCE_EVIDENCE_REQUIRED`);
    for (const dimension of STUDY_DIMENSIONS) {
      const analysis = object(study.analysis)[dimension];
      if (prose(analysis).length < 40) failures.push(`${prefix}_${dimension.toUpperCase()}_ANALYSIS_REQUIRED`);
    }
  });
  const dna = object(benchmark_lab.craft_dna);
  if (list(dna.transferable_principles).length < 8) failures.push("BENCHMARK_CRAFT_DNA_EIGHT_PRINCIPLES_REQUIRED");
  if (list(dna.anti_copy_rules).length < 3) failures.push("BENCHMARK_CRAFT_DNA_ANTI_COPY_REQUIRED");
  if (list(dna.sound_principles).length < 3) failures.push("BENCHMARK_CRAFT_DNA_SOUND_REQUIRED");
  if (list(dna.editorial_principles).length < 3) failures.push("BENCHMARK_CRAFT_DNA_EDITORIAL_REQUIRED");
  if (list(dna.cinematography_principles).length < 3) failures.push("BENCHMARK_CRAFT_DNA_CINEMATOGRAPHY_REQUIRED");
  return Object.freeze({
    contract: CREATIVE_BENCHMARK_LAB_CONTRACT,
    passed: failures.length === 0,
    study_count: studies.length,
    studied_dimensions: STUDY_DIMENSIONS,
    failures: uniq(failures),
    evidence_only: true,
    media_generation_executed: false,
  });
}

export function evaluateBenchmarkDelta({ plan = {}, benchmark_lab = {} } = {}) {
  const studies = list(benchmark_lab.studies);
  const shots = flattenShots(plan);
  const failures = [];
  const shotText = shots.map((shot) => prose(shot));
  const total = Math.max(1, shots.length);
  const explainerCount = shotText.filter((value) => EXPLAINER.test(value)).length;
  const microCount = shotText.filter((value) => MICRO_SCALE.test(value)).length;
  const largeCount = shotText.filter((value) => LARGE_SCALE.test(value)).length;
  const consequenceCount = shots.filter((shot) => CONSEQUENCE.test(`${text(shot.action)} ${text(shot.purpose)}`)).length;
  const locations = uniq(shots.map((shot) => text(object(shot.scene_location).city || object(shot.scene_location).context || shot.location)).filter(Boolean));
  const durations = shots.map((shot) => Number(shot.duration_seconds)).filter(Number.isFinite);
  const durationSpread = durations.length ? Math.max(...durations) - Math.min(...durations) : 0;
  const signatureImages = list(plan.concept?.signature_images).length || list(plan.signature_images).length;
  const revealText = prose([plan.story?.resolution, shots.slice(-3), plan.concept?.visual_system]);
  const soundWorlds = uniq(shots.flatMap((shot) => [text(shot.audio?.source_sound), ...list(shot.audio?.sound_effects).map(text), text(shot.sound_design?.source_sound)]).filter(Boolean));
  const placeCausal = shots.filter((shot) => prose([shot.scene_location, shot.location, shot.action, shot.purpose]).length > 80 && /(weather|wind|architecture|distance|street|sea|terrain|local|port|warehouse|factory|hotel|market|traffic|station|airport)/i.test(prose(shot))).length;

  if (shots.length >= 8 && explainerCount / total > 0.35) failures.push("EXPLAINER_DENSITY_TOO_HIGH");
  if (shots.length >= 6 && (microCount === 0 || largeCount === 0)) failures.push("SCALE_CONTRAST_TOO_LOW");
  if (shots.length >= 6 && consequenceCount / total < 0.3) failures.push("HUMAN_CONSEQUENCE_TOO_LOW");
  if (locations.length >= 2 && placeCausal < Math.min(2, locations.length)) failures.push("PLACE_CAUSALITY_TOO_LOW");
  if (shots.length >= 6 && durationSpread < 2) failures.push("EDITORIAL_PATTERN_TOO_PREDICTABLE");
  if (shots.length >= 6 && soundWorlds.length < 4) failures.push("SOUND_WORLD_TOO_FLAT");
  if (GENERIC_REVEAL.test(revealText)) failures.push("GENERIC_TECH_REVEAL");
  if (signatureImages < 5) failures.push("BEAUTY_HERO_SHOT_DEFICIT");

  const benchmark_scores = Object.fromEntries(STUDY_DIMENSIONS.map((dimension) => [dimension, dimensionScore(studies, dimension)]));
  const greatness = Object.fromEntries(GREATNESS_DIMENSIONS.map((dimension) => [dimension, { benchmark_score: null, candidate_score: null, delta: null }]));
  return Object.freeze({
    contract: CREATIVE_BENCHMARK_DELTA_CONTRACT,
    passed: failures.length === 0,
    failures: uniq(failures),
    metrics: {
      shot_count: shots.length,
      explainer_density: Number((explainerCount / total).toFixed(3)),
      micro_scale_shots: microCount,
      large_scale_shots: largeCount,
      consequence_density: Number((consequenceCount / total).toFixed(3)),
      place_causal_shots: placeCausal,
      location_count: locations.length,
      shot_duration_spread_seconds: Number(durationSpread.toFixed(3)),
      distinct_sound_events: soundWorlds.length,
      signature_image_count: signatureImages,
    },
    benchmark_craft_scores: benchmark_scores,
    greatness_dimensions: greatness,
    correctness_is_not_greatness: true,
    media_generation_executed: false,
  });
}

export function evaluateBenchmarkLab({ plan = {}, benchmark_lab = {}, minimum_studies = 3 } = {}) {
  const study = evaluateBenchmarkStudy({ benchmark_lab, minimum_studies });
  const delta = evaluateBenchmarkDelta({ plan, benchmark_lab });
  return Object.freeze({
    contract: CREATIVE_BENCHMARK_LAB_CONTRACT,
    passed: study.passed && delta.passed,
    study,
    delta,
    failures: uniq([...study.failures, ...delta.failures]),
  });
}

export const CreativeBenchmarkLabRuntime = Object.freeze({
  contract: CREATIVE_BENCHMARK_LAB_CONTRACT,
  study_dimensions: STUDY_DIMENSIONS,
  greatness_dimensions: GREATNESS_DIMENSIONS,
  evaluateBenchmarkStudy,
  evaluateBenchmarkDelta,
  evaluateBenchmarkLab,
});
