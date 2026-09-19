import { resolveVoiceReferenceForExecution } from "@/lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceLibrary";
import { assessMusicSourceReadiness } from "./CreativeMusicSourceReadinessRuntime.js";

export const MUSIC_SINGING_VOICE_IDENTITY_CONTRACT = "AVANTIQO_MUSIC_SINGING_VOICE_IDENTITY_V1";
export const MUSIC_SINGING_VOICE_CONVERSION_CAPABILITY = "ai.audio.singing-voice-convert";
export const MUSIC_SINGING_VOICE_FOUNDATION_MODEL = "Plachtaa/seed-vc";
export const MUSIC_SINGING_VOICE_MODEL_PROFILE = "SEED_VC_ZERO_SHOT_SVC_44K_V1";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

export async function buildSingingVoiceIdentityPlan({
  organization_id,
  entity_id = null,
  voice_library_profile_id,
  source_audio = null,
  source_is_isolated_vocal = false,
  source_duration_seconds = null,
  preserve_source_pitch = true,
  consent_verified = false,
  model_license_verified = false,
  runtime_certified = false,
  reference_is_isolated_vocal = false,
  reference_duration_seconds = null,
  reference_snr_db = null,
  reference_accompaniment_ratio = null,
  reference_reverb_ratio = null,
  reference_clipping_ratio = null,
} = {}) {
  if (!text(organization_id)) throw new Error("MUSIC_SINGING_VOICE_ORGANIZATION_REQUIRED");
  if (!text(voice_library_profile_id)) throw new Error("MUSIC_SINGING_VOICE_PROFILE_REQUIRED");
  if (!consent_verified) throw new Error("MUSIC_SINGING_VOICE_EXPLICIT_CONSENT_REQUIRED");

  const reference = await resolveVoiceReferenceForExecution({
    organizationId: organization_id,
    entityId: entity_id,
    profileId: voice_library_profile_id,
    purpose: "SINGING",
  });
  const duration = finite(source_duration_seconds, null);
  const needsIsolation = Boolean(source_audio) && source_is_isolated_vocal !== true;
  const referenceReadiness = assessMusicSourceReadiness({
    operation: "singing_voice_identity",
    isolated_vocal: reference_is_isolated_vocal === true,
    reference_duration_seconds,
    snr_db: reference_snr_db,
    accompaniment_ratio: reference_accompaniment_ratio,
    reverb_ratio: reference_reverb_ratio,
    clipping_ratio: reference_clipping_ratio,
  });
  const blockers = [...referenceReadiness.blockers];
  if (needsIsolation) blockers.push("VOCAL_ISOLATION_REQUIRED");
  if (!model_license_verified) blockers.push("MODEL_LICENSE_VERIFICATION_REQUIRED");
  if (!runtime_certified) blockers.push("OWNED_RUNTIME_CERTIFICATION_REQUIRED");

  return {
    contract: MUSIC_SINGING_VOICE_IDENTITY_CONTRACT,
    capability: MUSIC_SINGING_VOICE_CONVERSION_CAPABILITY,
    foundation_model: MUSIC_SINGING_VOICE_FOUNDATION_MODEL,
    quality_profile: MUSIC_SINGING_VOICE_MODEL_PROFILE,
    voice_profile_id: voice_library_profile_id,
    consent: { confirmed: true, scope: "SINGING", basis: reference?.voice_reference?.consent?.basis || null },
    source: {
      audio_present: Boolean(source_audio),
      duration_seconds: duration,
      isolated_vocal: source_is_isolated_vocal === true,
      isolate_with_capability: needsIsolation ? "ai.audio.stems" : null,
      separation_model: needsIsolation ? "demucs-htdemucs-ft" : null,
    },
    reference_quality: referenceReadiness,
    conversion: {
      zero_shot: true,
      preserve_source_pitch: preserve_source_pitch !== false,
      preserve_guide_timing: true,
      preserve_guide_phrasing: true,
      reference_audio_private: true,
      reference_audio_persisted_in_voice_library: true,
      cross_organization_reuse_forbidden: true,
      output_requires_identity_fidelity_review: true,
    },
    executable: blockers.length === 0,
    blockers,
    provider_job_submitted: false,
    paid_execution_started: false,
  };
}

export const CreativeMusicSingingVoiceIdentityRuntime = Object.freeze({
  contract: MUSIC_SINGING_VOICE_IDENTITY_CONTRACT,
  capability: MUSIC_SINGING_VOICE_CONVERSION_CAPABILITY,
  foundation_model: MUSIC_SINGING_VOICE_FOUNDATION_MODEL,
  quality_profile: MUSIC_SINGING_VOICE_MODEL_PROFILE,
  plan: buildSingingVoiceIdentityPlan,
});
