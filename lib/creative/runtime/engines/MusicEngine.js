const MASTERING_PROFILES = Object.freeze({
  streaming: Object.freeze({ target_lufs: -14, true_peak_dbtp: -1 }),
  cinematic: Object.freeze({ target_lufs: -16, true_peak_dbtp: -1 }),
  broadcast: Object.freeze({ target_lufs: -23, true_peak_dbtp: -1 }),
  club: Object.freeze({ target_lufs: -9, true_peak_dbtp: -0.8 }),
});

const ADVANCED_CAPABILITIES = Object.freeze({
  remix: Object.freeze({
    capability: "ai.audio.remix",
    task_type: "cover",
    model_lane: "acestep-v15-turbo",
    source_audio_required: true,
    implementation: "IMPLEMENTED",
    certification: "BENCHMARK_REQUIRED",
  }),
  edit: Object.freeze({
    capability: "ai.audio.edit",
    task_type: "repaint",
    model_lane: "acestep-v15-turbo",
    source_audio_required: true,
    implementation: "IMPLEMENTED",
    certification: "BENCHMARK_REQUIRED",
  }),
  extend: Object.freeze({
    capability: "ai.audio.extend",
    task_type: "complete",
    model_lane: "acestep-v15-base",
    source_audio_required: true,
    implementation: "BASE_MODEL_LANE_REQUIRED",
    certification: "BASE_MODEL_AND_BENCHMARK_REQUIRED",
  }),
  stems: Object.freeze({
    capability: "ai.audio.stems",
    task_type: "extract",
    model_lane: "acestep-v15-base",
    source_audio_required: true,
    implementation: "BASE_MODEL_LANE_REQUIRED",
    certification: "BASE_MODEL_AND_BENCHMARK_REQUIRED",
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

  const durationSeconds = clamp(input.duration_seconds, 10, 180, 30);
  const bpm = Math.round(clamp(input.bpm, 30, 300, 96));
  const keyscale = text(input.keyscale || input.key || "").slice(0, 32);
  const rawTimeSignature = text(input.timesignature || input.time_signature || "4");
  const timesignature = ({ "2/4": "2", "3/4": "3", "4/4": "4", "6/8": "6" })[rawTimeSignature] || rawTimeSignature;

  if (!["2", "3", "4", "6"].includes(timesignature)) {
    const error = new Error("CREATIVE_MUSIC_TIME_SIGNATURE_INVALID");
    error.code = "CREATIVE_MUSIC_TIME_SIGNATURE_INVALID";
    throw error;
  }

  const requestedProfile = text(input.mastering_profile || "streaming").toLowerCase();
  const masteringProfile = Object.hasOwn(MASTERING_PROFILES, requestedProfile)
    ? requestedProfile
    : "streaming";
  const mastering = MASTERING_PROFILES[masteringProfile];
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
    mastering_profile: masteringProfile,
    mastering,
    direction,
  };
}

export function buildMusicGenerationPlan(input = {}) {
  const session = normalizeMusicBrief(input);
  return {
    service_id: "ai.music.generate",
    capability: "ai.music.generate",
    category: "AI",
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

  const session = normalizeMusicBrief(input);
  const plan = {
    operation: key,
    service_id: contract.capability,
    capability: contract.capability,
    task_type: contract.task_type,
    model_lane: contract.model_lane,
    source_audio: sourceAudio,
    source_audio_required: contract.source_audio_required,
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

  return plan;
}

export function musicCapabilityState() {
  return {
    compose: "CERTIFIED",
    remix: ADVANCED_CAPABILITIES.remix.certification,
    edit: ADVANCED_CAPABILITIES.edit.certification,
    extend: ADVANCED_CAPABILITIES.extend.certification,
    stems: ADVANCED_CAPABILITIES.stems.certification,
    mix: "FINISHING_RUNTIME_AVAILABLE",
    master: "FINISHING_RUNTIME_AVAILABLE",
  };
}

export const MusicEngine = {
  id: "music",
  owner: "AVANTIQO",
  family: "ACE_STEP_1_5",
  certifiedCapability: "ai.music.generate",
  normalize: normalizeMusicBrief,
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
