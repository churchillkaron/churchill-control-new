const CONTRACT = "AVANTIQO_MUSIC_PROFESSIONAL_PRODUCTION_V1";

const STAGES = Object.freeze([
  ["SOURCE_GENERATION", "Source generation", true],
  ["STEM_SEPARATION", "Stem separation", true],
  ["VOCAL_PRODUCTION", "Vocal production", false],
  ["MIX_ENGINEERING", "Mix engineering", true],
  ["PREMASTER_QC", "Pre-master QC", true],
  ["PREMASTER_LISTENING", "Pre-master listening", true],
  ["MASTERING", "Mastering", true],
  ["PERCEPTUAL_TRANSLATION", "Perceptual translation", true],
  ["DAILIES_LISTENING", "Independent dailies", true],
  ["FINAL_TRIBUNAL", "Final release tribunal", true],
]);

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }

function hasVocalRequirement({ plan = {}, input = {} } = {}) {
  if (input.instrumental === true) return false;
  if (input.instrumental === false) return true;
  const selected = new Set(list(plan.selected_capabilities).map((row) => text(row?.id)));
  if (selected.has("create_song") || selected.has("record_vocals") || selected.has("singing_voice_identity")) return true;
  const objective = text(plan.objective || input.objective).toLowerCase();
  return /\b(vocal|vocals|singer|singing|song|lyrics|voice)\b/.test(objective);
}

function stageEvidence(evidence = {}) {
  const source = object(evidence);
  return {
    SOURCE_GENERATION: source.source_generated === true || Boolean(source.source_asset_id),
    STEM_SEPARATION: source.stems_ready === true || list(source.stems).length >= 2,
    VOCAL_PRODUCTION: source.vocal_production_passed === true,
    MIX_ENGINEERING: source.mix_passed === true || Boolean(source.mix_asset_id),
    PREMASTER_QC: source.premaster_qc_passed === true,
    PREMASTER_LISTENING: source.premaster_listening_passed === true,
    MASTERING: source.mastering_passed === true || Boolean(source.master_asset_id),
    PERCEPTUAL_TRANSLATION: source.perceptual_translation_passed === true,
    DAILIES_LISTENING: source.dailies_passed === true,
    FINAL_TRIBUNAL: source.tribunal_passed === true,
  };
}

export function buildMusicProfessionalProductionManifest({ plan = {}, input = {}, evidence = {} } = {}) {
  const vocalsRequired = hasVocalRequirement({ plan, input });
  const resolved = stageEvidence(evidence);
  const stages = STAGES.map(([id, name, alwaysRequired], index) => {
    const required = alwaysRequired || (id === "VOCAL_PRODUCTION" && vocalsRequired);
    const passed = required ? resolved[id] === true : true;
    return {
      id,
      name,
      order: index + 1,
      required,
      passed,
      status: required ? (passed ? "PASS" : "REQUIRED") : "NOT_REQUIRED",
    };
  });
  const blockers = stages.filter((stage) => stage.required && !stage.passed).map((stage) => stage.id);
  return {
    contract: CONTRACT,
    standard: "PROFESSIONAL_RELEASE",
    commercial_release_mode: true,
    vocals_required: vocalsRequired,
    stages,
    blockers,
    release_ready: blockers.length === 0,
    fast_generation_is_not_professional_master: true,
    generated_stereo_requires_post_production: true,
    publication_authorized: false,
  };
}


const ACTIONS = Object.freeze({
  SOURCE_GENERATION: { action: 'GENERATE_SOURCE', execution_surface: 'SERVER', capability: 'ai.music.generate' },
  STEM_SEPARATION: { action: 'SEPARATE_STEMS', execution_surface: 'SERVER', capability: 'ai.audio.stems' },
  VOCAL_PRODUCTION: { action: 'PRODUCE_VOCALS', execution_surface: 'SERVER_OR_WORKSTATION', capability: 'creative.music.vocal-production' },
  MIX_ENGINEERING: { action: 'BUILD_AND_RENDER_MIX', execution_surface: 'WORKSTATION', capability: 'creative.music.mix' },
  PREMASTER_QC: { action: 'VERIFY_PREMASTER', execution_surface: 'SERVER', capability: 'creative.music.quality' },
  PREMASTER_LISTENING: { action: 'REVIEW_PREMASTER_LISTENING', execution_surface: 'SERVER', capability: 'creative.music.quality' },
  MASTERING: { action: 'MASTER_PREMASTER', execution_surface: 'SERVER', capability: 'creative.audio.finish' },
  PERCEPTUAL_TRANSLATION: { action: 'VERIFY_TRANSLATION', execution_surface: 'SERVER', capability: 'creative.music.quality' },
  DAILIES_LISTENING: { action: 'RUN_DAILIES', execution_surface: 'SERVER', capability: 'creative.music.quality' },
  FINAL_TRIBUNAL: { action: 'RUN_FINAL_TRIBUNAL', execution_surface: 'SERVER', capability: 'creative.music.quality' },
});

export function nextMusicProfessionalProductionAction({ plan = {}, input = {}, evidence = {} } = {}) {
  const manifest = buildMusicProfessionalProductionManifest({ plan, input, evidence });
  const stage = manifest.stages.find((row) => row.required && !row.passed) || null;
  if (!stage) return { contract: CONTRACT, status: 'COMPLETE', release_ready: true, next_action: null, manifest };
  const action = ACTIONS[stage.id];
  return {
    contract: CONTRACT,
    status: 'NEXT_STAGE_REQUIRED',
    release_ready: false,
    stage_id: stage.id,
    stage_name: stage.name,
    next_action: action ? { ...action, stage_id: stage.id } : null,
    manifest,
    publication_authorized: false,
  };
}

export const CreativeMusicProfessionalProductionRuntime = Object.freeze({
  contract: CONTRACT,
  stages: STAGES.map(([id, name]) => ({ id, name })),
  build: buildMusicProfessionalProductionManifest,
  nextAction: nextMusicProfessionalProductionAction,
});
