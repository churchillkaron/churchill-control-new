import {
  MUSIC_MASTERING_PROFILES,
  MUSIC_SOURCE_AUDIO_MAX_SECONDS,
  normalizeSourceAudioRightsAttestation,
} from "@/lib/creative/runtime/engines/MusicEngine";

const CONTRACT = "AVANTIQO_MUSIC_AUTO_STUDIO_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";

const AUDIO_EXTENSIONS = new Set([
  "wav",
  "mp3",
  "m4a",
  "aac",
  "flac",
  "ogg",
  "opus",
]);
const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "m4v",
  "webm",
  "mkv",
]);

const SOURCE_ROLES = Object.freeze({
  AUTO: "auto",
  SONG: "song",
  VOCAL: "vocal",
  LIVE_PERFORMANCE: "live_performance",
  PERFORMANCE_VIDEO: "performance_video",
  STEMS: "stems",
});

const GOALS = Object.freeze({
  RELEASE_MASTER: "release_master",
  PERFORMANCE_POLISH: "performance_polish",
  VOCAL_POLISH: "vocal_polish",
  MUSIC_VIDEO_AUDIO: "music_video_audio",
  MIX_AND_MASTER: "mix_and_master",
});

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function extension(value) {
  const clean = text(value).split(/[?#]/)[0];
  const name = clean.split("/").pop() || "";
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function inferMediaKind(input = {}) {
  const mime = text(input.mime_type || input.content_type).toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const ext = extension(input.file_name || input.source_name || input.source_media);
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  return "unknown";
}

function normalizeSourceRole(input, mediaKind) {
  const requested = text(input.source_role || SOURCE_ROLES.AUTO).toLowerCase();
  const allowed = new Set(Object.values(SOURCE_ROLES));
  if (!allowed.has(requested)) {
    const error = new Error(`CREATIVE_MUSIC_AUTO_STUDIO_SOURCE_ROLE_INVALID:${requested || "MISSING"}`);
    error.code = "CREATIVE_MUSIC_AUTO_STUDIO_SOURCE_ROLE_INVALID";
    throw error;
  }
  if (requested !== SOURCE_ROLES.AUTO) return requested;
  if (mediaKind === "video") return SOURCE_ROLES.PERFORMANCE_VIDEO;
  return SOURCE_ROLES.SONG;
}

function normalizeGoal(input, sourceRole) {
  const requested = text(input.goal).toLowerCase();
  const allowed = new Set(Object.values(GOALS));
  if (requested) {
    if (!allowed.has(requested)) {
      const error = new Error(`CREATIVE_MUSIC_AUTO_STUDIO_GOAL_INVALID:${requested}`);
      error.code = "CREATIVE_MUSIC_AUTO_STUDIO_GOAL_INVALID";
      throw error;
    }
    return requested;
  }
  if (sourceRole === SOURCE_ROLES.VOCAL) return GOALS.VOCAL_POLISH;
  if (sourceRole === SOURCE_ROLES.PERFORMANCE_VIDEO) return GOALS.MUSIC_VIDEO_AUDIO;
  if (sourceRole === SOURCE_ROLES.LIVE_PERFORMANCE) return GOALS.PERFORMANCE_POLISH;
  if (sourceRole === SOURCE_ROLES.STEMS) return GOALS.MIX_AND_MASTER;
  return GOALS.RELEASE_MASTER;
}

function normalizeMasteringProfile(input = {}, goal) {
  const requested = text(input.mastering_profile).toLowerCase();
  if (requested && Object.hasOwn(MUSIC_MASTERING_PROFILES, requested)) return requested;
  if (goal === GOALS.MUSIC_VIDEO_AUDIO) return "cinematic";
  if (goal === GOALS.PERFORMANCE_POLISH) return "streaming";
  return "streaming";
}

function stage({
  id,
  label,
  description,
  runtime,
  status = "READY",
  automatic = true,
  required = true,
  safeLease = false,
  notes = [],
}) {
  return {
    id,
    label,
    description,
    runtime,
    status,
    automatic,
    required,
    safe_lease_required: safeLease,
    safe_lease_contract: safeLease ? SAFE_LEASE_CONTRACT : null,
    notes,
  };
}

function needsVocalEngineering(sourceRole, goal) {
  return [
    SOURCE_ROLES.VOCAL,
    SOURCE_ROLES.LIVE_PERFORMANCE,
    SOURCE_ROLES.PERFORMANCE_VIDEO,
  ].includes(sourceRole) || [
    GOALS.VOCAL_POLISH,
    GOALS.PERFORMANCE_POLISH,
    GOALS.MUSIC_VIDEO_AUDIO,
  ].includes(goal);
}

function needsStemIntelligence(sourceRole, goal) {
  return [
    SOURCE_ROLES.LIVE_PERFORMANCE,
    SOURCE_ROLES.PERFORMANCE_VIDEO,
    SOURCE_ROLES.STEMS,
  ].includes(sourceRole) || [
    GOALS.PERFORMANCE_POLISH,
    GOALS.MUSIC_VIDEO_AUDIO,
    GOALS.MIX_AND_MASTER,
  ].includes(goal);
}

export function buildMusicAutoStudioPlan(input = {}) {
  const sourceMedia = input.source_media || input.source_audio || input.audio || input.media || null;
  if (!sourceMedia) {
    const error = new Error("CREATIVE_MUSIC_AUTO_STUDIO_SOURCE_REQUIRED");
    error.code = "CREATIVE_MUSIC_AUTO_STUDIO_SOURCE_REQUIRED";
    throw error;
  }

  const mediaKind = inferMediaKind({
    ...input,
    source_media: sourceMedia,
  });
  if (mediaKind === "unknown") {
    const error = new Error("CREATIVE_MUSIC_AUTO_STUDIO_MEDIA_TYPE_UNSUPPORTED");
    error.code = "CREATIVE_MUSIC_AUTO_STUDIO_MEDIA_TYPE_UNSUPPORTED";
    throw error;
  }

  const rightsAttestation = normalizeSourceAudioRightsAttestation(input);
  const sourceRole = normalizeSourceRole(input, mediaKind);
  const goal = normalizeGoal(input, sourceRole);
  const masteringProfile = normalizeMasteringProfile(input, goal);
  const mastering = MUSIC_MASTERING_PROFILES[masteringProfile];
  const sourceDurationSeconds = finite(
    input.source_duration_seconds ?? input.duration_seconds ?? input.duration,
    null,
  );
  if (
    sourceDurationSeconds !== null &&
    (sourceDurationSeconds <= 0 || sourceDurationSeconds > MUSIC_SOURCE_AUDIO_MAX_SECONDS)
  ) {
    const error = new Error(
      `CREATIVE_MUSIC_AUTO_STUDIO_SOURCE_DURATION_INVALID:max=${MUSIC_SOURCE_AUDIO_MAX_SECONDS}`,
    );
    error.code = "CREATIVE_MUSIC_AUTO_STUDIO_SOURCE_DURATION_INVALID";
    throw error;
  }

  const vocalEngineering = needsVocalEngineering(sourceRole, goal);
  const stemIntelligence = needsStemIntelligence(sourceRole, goal);
  const stages = [
    stage({
      id: "ingest",
      label: "Ingest",
      description: "Validate the uploaded media, rights attestation and source limits.",
      runtime: "AVANTIQO_MUSIC_AUTO_STUDIO_LOCAL",
    }),
    stage({
      id: "analyze",
      label: "Analyze",
      description: "Inspect audio stream, duration, sample rate, channels, loudness and delivery risk before processing.",
      runtime: "AVANTIQO_MUSIC_AUTO_STUDIO_LOCAL",
    }),
    ...(mediaKind === "video"
      ? [stage({
          id: "extract_audio",
          label: "Extract audio",
          description: "Use the embedded performance audio as the Music Studio source without editing the video picture.",
          runtime: "AVANTIQO_MUSIC_AUTO_STUDIO_LOCAL",
        })]
      : []),
    stage({
      id: "restore",
      label: "Repair",
      description: "Apply conservative local cleanup for recording defects before creative processing and mastering.",
      runtime: "AVANTIQO_MUSIC_AUTO_STUDIO_LOCAL",
      notes: [
        "Noise/hum cleanup, safe filtering, dynamics preparation and clipping protection belong here.",
        "The source recording remains preserved as immutable evidence.",
      ],
    }),
    ...(stemIntelligence
      ? [stage({
          id: "stems",
          label: "Stem intelligence",
          description: "Separate and rebalance vocals, drums, bass and music when the source benefits from multitrack control.",
          runtime: "AVANTIQO_MUSIC_SEPARATOR",
          status: "CERTIFICATION_REQUIRED",
          required: false,
          safeLease: true,
          notes: [
            "Demucs htdemucs_ft lane is implemented but remains certification and human-review gated.",
            "No RunPod job may be submitted outside the safe-lease controller.",
          ],
        })]
      : []),
    ...(vocalEngineering
      ? [stage({
          id: "vocal_engineering",
          label: "Vocal engineering",
          description: "Clean and shape the lead vocal, including de-essing, tonal repair, dynamics, timing and pitch work when evidence requires it.",
          runtime: "AVANTIQO_MUSIC_VOCAL_ENGINEERING",
          status: "ENGINE_COMPLETION_REQUIRED",
          required: false,
          safeLease: true,
          notes: [
            "Local mastering alone must never be presented as pitch correction or elite vocal repair.",
            "A dedicated certified vocal-engineering lane is required before this stage can claim full studio parity.",
          ],
        })]
      : []),
    stage({
      id: "mix",
      label: "Mix",
      description: "Build the final stereo balance, track hierarchy, gain structure and release-oriented dynamics.",
      runtime: "AVANTIQO_AUDIO_FINISHING",
    }),
    stage({
      id: "master",
      label: "Master",
      description: "Master to the selected loudness and true-peak target and create release deliveries.",
      runtime: "AVANTIQO_AUDIO_FINISHING",
    }),
    stage({
      id: "quality",
      label: "Quality control",
      description: "Verify loudness, true peak, codecs, waveform evidence and release readiness.",
      runtime: "AVANTIQO_AUDIO_FINISHING",
    }),
    stage({
      id: "delivery",
      label: "Delivery",
      description: "Deliver a 24-bit WAV master, 320 kbps MP3 and available supporting assets.",
      runtime: "AVANTIQO_MUSIC_AUTO_STUDIO_LOCAL",
    }),
  ];

  const blockingForElite = stages.filter((entry) => (
    entry.status !== "READY" &&
    (entry.id === "vocal_engineering" || entry.id === "stems")
  ));

  return {
    contract: CONTRACT,
    title: text(input.title || input.file_name || "Auto Studio session").slice(0, 160),
    mode: "FULL_AUTO",
    default_action_label: "MAKE IT PROFESSIONAL",
    source: {
      reference: sourceMedia,
      media_kind: mediaKind,
      source_role: sourceRole,
      file_name: text(input.file_name) || null,
      mime_type: text(input.mime_type || input.content_type) || null,
      duration_seconds: sourceDurationSeconds,
      max_duration_seconds: MUSIC_SOURCE_AUDIO_MAX_SECONDS,
      preserve_original: true,
      rights_attestation: rightsAttestation,
    },
    goal,
    automatic_decisions: {
      source_analysis: true,
      processing_chain_selection: true,
      mastering_profile_selection: !text(input.mastering_profile),
      expert_controls_required: false,
      provider_selection_exposed: false,
      raw_prompt_surface: false,
    },
    mastering: {
      profile: masteringProfile,
      target_lufs: mastering.target_lufs,
      true_peak_dbtp: mastering.true_peak_dbtp,
      sample_rate: 48000,
      channels: 2,
      deliveries: [
        { id: "master-wav", format: "wav", codec: "pcm_s24le" },
        { id: "master-mp3", format: "mp3", bitrate: "320k" },
      ],
    },
    stages,
    readiness: {
      local_analyze_mix_master_ready: true,
      full_auto_studio_ready: blockingForElite.length === 0,
      elite_studio_blockers: blockingForElite.map((entry) => ({
        stage: entry.id,
        status: entry.status,
      })),
      generation_engine_rebuild_required: false,
    },
    execution_policy: {
      local_audio_finishing_requires_runpod: false,
      gpu_stage_requires_safe_lease: stages.some((entry) => entry.safe_lease_required),
      safe_lease_contract: SAFE_LEASE_CONTRACT,
      direct_workers_max_write_allowed: false,
      runpod_job_outside_safe_lease_allowed: false,
    },
  };
}

export const CreativeMusicAutoStudioRuntime = {
  contract: CONTRACT,
  sourceRoles: SOURCE_ROLES,
  goals: GOALS,
  plan: buildMusicAutoStudioPlan,
};
