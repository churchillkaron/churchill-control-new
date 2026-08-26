const MASTERING_PROFILES = Object.freeze({
  streaming: Object.freeze({ target_lufs: -14, true_peak_dbtp: -1 }),
  cinematic: Object.freeze({ target_lufs: -16, true_peak_dbtp: -1 }),
  broadcast: Object.freeze({ target_lufs: -23, true_peak_dbtp: -1 }),
  club: Object.freeze({ target_lufs: -9, true_peak_dbtp: -0.8 }),
});

const MUSIC_QUALITY_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";
const MUSIC_MODEL_LANE = "acestep-v15-xl-turbo";
const MUSIC_GENERATION_MAX_DURATION_SECONDS = 180;
const SOURCE_AUDIO_MAX_DURATION_SECONDS = 900;
const SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT = "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1";
const SOURCE_AUDIO_RIGHTS_STATEMENT =
  "I confirm I have the rights or permission required for my intended use of this source audio.";
const SOURCE_AUDIO_CONTENT_POLICY = "USER_RIGHTS_ATTESTATION_ONLY";
const TEMPORAL_EXTEND_STRATEGY = "XL_TURBO_REPAINT_RIGHT_OUTPAINT_V1";
const STEM_SEPARATOR_LANE = "demucs-htdemucs-ft";
const STEM_SEPARATOR_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1";
const STEM_NAMES = Object.freeze(["vocals", "drums", "bass", "other"]);
const BACKING_TRACK_STEMS = Object.freeze(["drums", "bass", "other"]);

const ADVANCED_CAPABILITIES = Object.freeze({
  remix: Object.freeze({
    capability: "ai.audio.remix",
    task_type: "cover",
    model_lane: MUSIC_MODEL_LANE,
    source_audio_required: true,
    rights_attestation_required: true,
    implementation: "IMPLEMENTED",
    certification: "BENCHMARK_REQUIRED",
  }),
  edit: Object.freeze({
    capability: "ai.audio.edit",
    task_type: "repaint",
    model_lane: MUSIC_MODEL_LANE,
    source_audio_required: true,
    rights_attestation_required: true,
    implementation: "IMPLEMENTED",
    certification: "BENCHMARK_REQUIRED",
  }),
  extend: Object.freeze({
    capability: "ai.audio.extend",
    task_type: "repaint",
    model_lane: MUSIC_MODEL_LANE,
    source_audio_required: true,
    rights_attestation_required: true,
    implementation: "IMPLEMENTED",
    certification: "BENCHMARK_REQUIRED",
  }),
  stems: Object.freeze({
    capability: "ai.audio.stems",
    task_type: "separate_stems",
    model_lane: STEM_SEPARATOR_LANE,
    quality_profile: STEM_SEPARATOR_PROFILE,
    source_audio_required: true,
    rights_attestation_required: true,
    implementation: "IMPLEMENTED",
    certification: "BENCHMARK_AND_HUMAN_REVIEW_REQUIRED",
  }),
  backing_track: Object.freeze({
    capability: "ai.audio.stems",
    task_type: "backing_track",
    model_lane: STEM_SEPARATOR_LANE,
    quality_profile: STEM_SEPARATOR_PROFILE,
    source_audio_required: true,
    rights_attestation_required: true,
    implementation: "IMPLEMENTED",
    certification: "BENCHMARK_AND_HUMAN_REVIEW_REQUIRED",
  }),
});

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback) {
  const number = finite(value, fallback);
  return Math.max(min, Math.min(max, number));
}

function integer(value, min, max, fallback) {
  return Math.round(clamp(value, min, max, fallback));
}

function masteringProfile(input = {}) {
  const requestedProfile = text(input.mastering_profile || "streaming").toLowerCase();
  const profile = Object.hasOwn(MASTERING_PROFILES, requestedProfile)
    ? requestedProfile
    : "streaming";
  return {
    mastering_profile: profile,
    mastering: MASTERING_PROFILES[profile],
  };
}

function sourceAudioDuration(input = {}) {
  const supplied = finite(
    input.source_duration_seconds ??
      input.sourceDurationSeconds ??
      input.duration_seconds ??
      input.duration,
    null,
  );
  if (supplied === null) return null;
  if (supplied <= 0 || supplied > SOURCE_AUDIO_MAX_DURATION_SECONDS) {
    const error = new Error(
      `CREATIVE_MUSIC_SOURCE_DURATION_INVALID:max=${SOURCE_AUDIO_MAX_DURATION_SECONDS}`,
    );
    error.code = "CREATIVE_MUSIC_SOURCE_DURATION_INVALID";
    throw error;
  }
  return supplied;
}

export function normalizeSourceAudioRightsAttestation(input = {}) {
  const supplied = input.rights_attestation || input.source_rights_attestation || {};
  const confirmed = input.source_rights_confirmed === true || supplied?.confirmed === true;
  if (!confirmed) {
    const error = new Error("CREATIVE_MUSIC_SOURCE_RIGHTS_CONFIRMATION_REQUIRED");
    error.code = "CREATIVE_MUSIC_SOURCE_RIGHTS_CONFIRMATION_REQUIRED";
    throw error;
  }
  return {
    contract: SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
    confirmed: true,
    statement: SOURCE_AUDIO_RIGHTS_STATEMENT,
    content_restriction_policy: SOURCE_AUDIO_CONTENT_POLICY,
  };
}

export function normalizeMusicBrief(input = {}) {
  const style = text(input.style || input.genre || "cinematic modern").slice(0, 120);
  const mood = text(input.mood || "premium, emotionally controlled").slice(0, 120);
  const energy = text(input.energy || "balanced").slice(0, 80);
  const instrumentation = text(input.instrumentation || "").slice(0, 240);
  const structure = text(input.structure || "intro, development, lift, resolution").slice(0, 240);
  const title = text(input.title || "Untitled composition").slice(0, 160);
  const instrumental = input.instrumental !== false;
  const lyrics = instrumental ? "" : text(input.lyrics).slice(0, 4096);

  if (!instrumental && !lyrics) {
    const error = new Error("CREATIVE_MUSIC_LYRICS_REQUIRED_FOR_VOCAL_MODE");
    error.code = "CREATIVE_MUSIC_LYRICS_REQUIRED_FOR_VOCAL_MODE";
    throw error;
  }

  const durationSeconds = clamp(
    input.duration_seconds,
    10,
    MUSIC_GENERATION_MAX_DURATION_SECONDS,
    30,
  );
  const bpm = Math.round(clamp(input.bpm, 30, 300, 96));
  const keyscale = text(input.keyscale || input.key || "").slice(0, 32);
  const rawTimeSignature = text(input.timesignature || input.time_signature || "4");
  const timesignature = ({ "2/4": "2", "3/4": "3", "4/4": "4", "6/8": "6" })[rawTimeSignature] || rawTimeSignature;

  if (!["2", "3", "4", "6"].includes(timesignature)) {
    const error = new Error("CREATIVE_MUSIC_TIME_SIGNATURE_INVALID");
    error.code = "CREATIVE_MUSIC_TIME_SIGNATURE_INVALID";
    throw error;
  }

  const mastering = masteringProfile(input);
  const vocalLanguage = instrumental
    ? "unknown"
    : text(input.vocal_language || "english").toLowerCase().slice(0, 16);

  const direction = [
    `${style} music`,
    `${mood} mood`,
    `${energy} energy`,
    instrumentation ? `instrumentation: ${instrumentation}` : null,
    `arrangement: ${structure}`,
    `${bpm} BPM`,
    keyscale ? `key: ${keyscale}` : null,
    instrumental ? "instrumental, no vocals" : `${vocalLanguage} vocals with supplied lyrics`,
    "cohesive arrangement, professional dynamics, strong musical transitions, release-quality composition",
  ].filter(Boolean).join("; ");

  return {
    title,
    style,
    mood,
    energy,
    instrumentation,
    structure,
    instrumental,
    lyrics,
    duration_seconds: durationSeconds,
    bpm,
    keyscale,
    timesignature,
    vocal_language: vocalLanguage,
    mastering_profile: mastering.mastering_profile,
    mastering: mastering.mastering,
    direction,
  };
}

export function normalizeBackingTrackRequest(input = {}) {
  const sourceAudio = input.source_audio || input.sourceAudio || input.audio || null;
  if (!sourceAudio) {
    const error = new Error("CREATIVE_MUSIC_SOURCE_AUDIO_REQUIRED:backing_track");
    error.code = "CREATIVE_MUSIC_SOURCE_AUDIO_REQUIRED";
    throw error;
  }

  const rightsAttestation = normalizeSourceAudioRightsAttestation(input);
  const sourceDurationSeconds = sourceAudioDuration(input);
  const mastering = masteringProfile(input);
  const keyShiftSemitones = integer(
    input.key_shift_semitones ?? input.pitch_shift_semitones,
    -12,
    12,
    0,
  );
  const tempoRatio = clamp(input.tempo_ratio ?? input.speed_ratio, 0.5, 2, 1);
  const countInBars = integer(input.count_in_bars, 0, 8, 0);
  const preserveArrangement = input.preserve_arrangement !== false;
  const exportStems = input.export_stems !== false;

  return {
    title: text(input.title || "Backing track").slice(0, 160),
    source_audio: sourceAudio,
    source_duration_seconds: sourceDurationSeconds,
    max_source_duration_seconds: SOURCE_AUDIO_MAX_DURATION_SECONDS,
    rights_attestation: rightsAttestation,
    separator: {
      model_lane: STEM_SEPARATOR_LANE,
      quality_profile: STEM_SEPARATOR_PROFILE,
      stems: [...STEM_NAMES],
      vocal_stem: "vocals",
      backing_stems: [...BACKING_TRACK_STEMS],
    },
    processing: {
      remove_vocals: true,
      preserve_arrangement: preserveArrangement,
      key_shift_semitones: keyShiftSemitones,
      tempo_ratio: tempoRatio,
      count_in_bars: countInBars,
      export_stems: exportStems,
      vocal_cleanup_required: true,
      source_timing_preserved_by_default: preserveArrangement,
    },
    mastering_profile: mastering.mastering_profile,
    mastering: mastering.mastering,
  };
}

export function buildMusicGenerationPlan(input = {}) {
  const session = normalizeMusicBrief(input);
  return {
    service_id: "ai.music.generate",
    capability: "ai.music.generate",
    category: "AI",
    model_lane: MUSIC_MODEL_LANE,
    quality_profile: MUSIC_QUALITY_PROFILE,
    generation: {
      caption: session.direction,
      lyrics: session.lyrics,
      instrumental: session.instrumental,
      bpm: session.bpm,
      keyscale: session.keyscale,
      timesignature: session.timesignature,
      duration_seconds: session.duration_seconds,
      vocal_language: session.vocal_language,
      structure: session.structure,
      style: session.style,
      mood: session.mood,
      energy: session.energy,
      instrumentation: session.instrumentation,
    },
    output_spec: {
      duration_seconds: session.duration_seconds,
      format: "wav",
      sample_rate: 48000,
      channels: 2,
      mastering_profile: session.mastering_profile,
      loudness: session.mastering,
    },
    session,
    certification: musicCapabilityState(),
  };
}

function buildStemSeparationPlan(key, contract, input, sourceAudio) {
  const backing = normalizeBackingTrackRequest({
    ...input,
    source_audio: sourceAudio,
  });
  const backingTrack = key === "backing_track";
  const processing = backingTrack
    ? backing.processing
    : {
        remove_vocals: false,
        preserve_arrangement: true,
        key_shift_semitones: 0,
        tempo_ratio: 1,
        count_in_bars: 0,
        export_stems: true,
        vocal_cleanup_required: false,
        source_timing_preserved_by_default: true,
      };

  return {
    operation: key,
    service_id: contract.capability,
    capability: contract.capability,
    task_type: contract.task_type,
    category: "AI",
    model_lane: contract.model_lane,
    quality_profile: contract.quality_profile,
    source_audio: sourceAudio,
    source_audio_required: true,
    rights_attestation_required: true,
    rights_attestation: backing.rights_attestation,
    source_processing_only: true,
    content_restriction_policy: SOURCE_AUDIO_CONTENT_POLICY,
    implementation: contract.implementation,
    certification: contract.certification,
    executable: contract.implementation === "IMPLEMENTED" && contract.certification === "CERTIFIED",
    session: backing,
    separation: {
      model_lane: STEM_SEPARATOR_LANE,
      quality_profile: STEM_SEPARATOR_PROFILE,
      stems: [...STEM_NAMES],
      vocal_stem: "vocals",
      backing_stems: backingTrack ? [...BACKING_TRACK_STEMS] : [...STEM_NAMES],
    },
    provider_parameters: processing,
    output_spec: {
      source_duration_seconds: backing.source_duration_seconds,
      max_source_duration_seconds: SOURCE_AUDIO_MAX_DURATION_SECONDS,
      format: "wav",
      sample_rate: 44100,
      channels: 2,
      stems: [...STEM_NAMES],
      backing_track: backingTrack,
      backing_track_stems: backingTrack ? [...BACKING_TRACK_STEMS] : [],
      deliveries: backingTrack
        ? ["backing_track_wav", "backing_track_mp3", ...(processing.export_stems ? ["stems_wav"] : [])]
        : ["stems_wav"],
      mastering_profile: backing.mastering_profile,
      loudness: backing.mastering,
    },
  };
}

export function buildMusicTransformationPlan(operation, input = {}) {
  const key = text(operation).toLowerCase();
  const contract = ADVANCED_CAPABILITIES[key];
  if (!contract) {
    const error = new Error(`CREATIVE_MUSIC_OPERATION_INVALID:${key || "MISSING"}`);
    error.code = "CREATIVE_MUSIC_OPERATION_INVALID";
    throw error;
  }
  const sourceAudio = input.source_audio || input.sourceAudio || input.audio || null;
  if (contract.source_audio_required && !sourceAudio) {
    const error = new Error(`CREATIVE_MUSIC_SOURCE_AUDIO_REQUIRED:${key}`);
    error.code = "CREATIVE_MUSIC_SOURCE_AUDIO_REQUIRED";
    throw error;
  }

  if (key === "stems" || key === "backing_track") {
    return buildStemSeparationPlan(key, contract, input, sourceAudio);
  }

  const rightsAttestation = contract.rights_attestation_required
    ? normalizeSourceAudioRightsAttestation(input)
    : null;
  const session = normalizeMusicBrief(input);
  const plan = {
    operation: key,
    service_id: contract.capability,
    capability: contract.capability,
    task_type: contract.task_type,
    model_lane: contract.model_lane,
    source_audio: sourceAudio,
    source_audio_required: contract.source_audio_required,
    rights_attestation_required: contract.rights_attestation_required === true,
    rights_attestation: rightsAttestation,
    content_restriction_policy: SOURCE_AUDIO_CONTENT_POLICY,
    implementation: contract.implementation,
    certification: contract.certification,
    executable: contract.implementation === "IMPLEMENTED" && contract.certification === "CERTIFIED",
    session,
    generation: {
      caption: session.direction,
      lyrics: session.lyrics,
      instrumental: session.instrumental,
      bpm: session.bpm,
      keyscale: session.keyscale,
      timesignature: session.timesignature,
      duration_seconds: session.duration_seconds,
      vocal_language: session.vocal_language,
      style: session.style,
      mood: session.mood,
      energy: session.energy,
      instrumentation: session.instrumentation,
    },
    output_spec: {
      duration_seconds: session.duration_seconds,
      format: "wav",
      sample_rate: 48000,
      channels: 2,
      mastering_profile: session.mastering_profile,
      loudness: session.mastering,
    },
  };

  if (key === "remix") {
    plan.provider_parameters = {
      audio_cover_strength: clamp(input.audio_cover_strength ?? input.cover_strength, 0, 1, 0.6),
    };
  }
  if (key === "edit") {
    const start = Math.max(0, finite(input.repainting_start ?? input.edit_start_seconds, 0));
    const end = finite(input.repainting_end ?? input.edit_end_seconds, -1);
    if (end >= 0 && end <= start) {
      const error = new Error("CREATIVE_MUSIC_REPAINT_RANGE_INVALID");
      error.code = "CREATIVE_MUSIC_REPAINT_RANGE_INVALID";
      throw error;
    }
    plan.provider_parameters = {
      repainting_start: start,
      repainting_end: end,
    };
  }
  if (key === "extend") {
    const extensionSeconds = clamp(input.extension_seconds ?? input.extend_seconds, 5, 120, 30);
    const continuityOverlapSeconds = clamp(
      input.continuity_overlap_seconds ?? input.overlap_seconds,
      1,
      12,
      4,
    );
    plan.temporal_extension = {
      strategy: TEMPORAL_EXTEND_STRATEGY,
      source_duration_measured_by_worker: true,
      right_padding_outpaint_required: true,
      temporal_extension_proven: false,
    };
    plan.generation = {
      ...plan.generation,
      duration_seconds: null,
      source_duration_measured_by_worker: true,
    };
    plan.provider_parameters = {
      extension_seconds: extensionSeconds,
      continuity_overlap_seconds: continuityOverlapSeconds,
      temporal_extend_strategy: TEMPORAL_EXTEND_STRATEGY,
    };
    plan.output_spec = {
      ...plan.output_spec,
      duration_seconds: null,
      duration_rule: "SOURCE_DURATION_PLUS_EXTENSION_SECONDS_BOUNDED_BY_WORKER_MAX",
    };
  }

  return plan;
}

export function musicCapabilityState() {
  return {
    compose: "CERTIFIED",
    remix: ADVANCED_CAPABILITIES.remix.certification,
    edit: ADVANCED_CAPABILITIES.edit.certification,
    extend: ADVANCED_CAPABILITIES.extend.certification,
    stems: ADVANCED_CAPABILITIES.stems.certification,
    backing_track: ADVANCED_CAPABILITIES.backing_track.certification,
    mix: "FINISHING_RUNTIME_AVAILABLE",
    master: "FINISHING_RUNTIME_AVAILABLE",
  };
}

export const MusicEngine = {
  id: "music",
  owner: "AVANTIQO",
  family: "ACE_STEP_1_5",
  modelLane: MUSIC_MODEL_LANE,
  qualityProfile: MUSIC_QUALITY_PROFILE,
  separatorLane: STEM_SEPARATOR_LANE,
  separatorProfile: STEM_SEPARATOR_PROFILE,
  sourceRightsAttestationContract: SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
  certifiedCapability: "ai.music.generate",
  normalize: normalizeMusicBrief,
  normalizeBackingTrack: normalizeBackingTrackRequest,
  plan: buildMusicGenerationPlan,
  transform: buildMusicTransformationPlan,
  capabilityState: musicCapabilityState,
  execute(context = {}) {
    const source = context.music || context.input || context;
    const plan = buildMusicGenerationPlan(source);
    return {
      ...context,
      music: {
        ...plan,
        automatic_execution_started: false,
        execution_runtime: "SERVICE_EXECUTION_RUNTIME",
        finishing_runtime: "AVANTIQO_AUDIO_FINISHING",
        version_runtime: "CREATIVE_MUSIC_FINISHING_RUNTIME",
      },
    };
  },
};

export const MUSIC_MASTERING_PROFILES = MASTERING_PROFILES;
export const MUSIC_ADVANCED_CAPABILITIES = ADVANCED_CAPABILITIES;
export const MUSIC_GENERATION_MAX_SECONDS = MUSIC_GENERATION_MAX_DURATION_SECONDS;
export const MUSIC_SOURCE_AUDIO_MAX_SECONDS = SOURCE_AUDIO_MAX_DURATION_SECONDS;
export const MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT = SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT;
export const MUSIC_TEMPORAL_EXTEND_STRATEGY = TEMPORAL_EXTEND_STRATEGY;
export const MUSIC_STEM_SEPARATOR_LANE = STEM_SEPARATOR_LANE;
export const MUSIC_STEM_SEPARATOR_PROFILE = STEM_SEPARATOR_PROFILE;
export const MUSIC_STEM_NAMES = STEM_NAMES;