#!/usr/bin/env node

const METAL_CAPTION = "Original dynamic heavy metal instrumental with quiet clean arpeggiated electric guitar opening, rising tension, then a tight heavy distorted power-chord riff with electric bass and punchy drums; continue with new original material while preserving the established E-minor identity, pulse, instrumentation and quiet-to-heavy dynamic arc";

const originalFetch = globalThis.fetch;
if (typeof originalFetch !== "function") {
  throw new Error("AVANTIQO_MUSIC_DYNAMIC_METAL_FETCH_REQUIRED");
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : String(input?.url || input);
  const isRunpodGenerationSubmit = /https:\/\/api\.runpod\.ai\/v2\/[^/]+\/run$/i.test(url);

  if (!isRunpodGenerationSubmit || init?.body === undefined) {
    return originalFetch(input, init);
  }

  let envelope;
  try {
    envelope = JSON.parse(String(init.body));
  } catch {
    throw new Error("AVANTIQO_MUSIC_DYNAMIC_METAL_RUNPOD_ENVELOPE_INVALID");
  }

  const jobInput = envelope?.input;
  const music = jobInput?.structured_specification?.music;
  const certification = jobInput?.certification;
  if (!jobInput || !music || !certification) {
    throw new Error("AVANTIQO_MUSIC_DYNAMIC_METAL_RUNPOD_PAYLOAD_INVALID");
  }
  if (jobInput.capability !== "ai.audio.extend") {
    throw new Error("AVANTIQO_MUSIC_DYNAMIC_METAL_EXTEND_REQUIRED");
  }
  if (certification.scope !== "music-transform-only" || certification.candidate !== true) {
    throw new Error("AVANTIQO_MUSIC_DYNAMIC_METAL_CANDIDATE_CERTIFICATION_REQUIRED");
  }
  if (certification.max_provider_jobs !== 1 || certification.benchmark_runs !== 1) {
    throw new Error("AVANTIQO_MUSIC_DYNAMIC_METAL_ONE_JOB_CONTRACT_REQUIRED");
  }
  if (
    certification.production_activation_allowed !== false ||
    certification.pricing_activation_allowed !== false ||
    certification.provider_selection_change_allowed !== false
  ) {
    throw new Error("AVANTIQO_MUSIC_DYNAMIC_METAL_RELEASE_MUTATION_FORBIDDEN");
  }

  music.caption = METAL_CAPTION;
  music.instrumental = true;
  music.test_profile = "DYNAMIC_METAL_CONTINUITY";
  music.reference_recording_used = false;
  music.artist_imitation_requested = false;

  console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_GENERATION_CAPTION=ORIGINAL_DYNAMIC_METAL_CONTINUITY");
  console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_REFERENCE_RECORDING_USED=false");
  console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_ARTIST_IMITATION_REQUESTED=false");

  return originalFetch(input, {
    ...init,
    body: JSON.stringify(envelope),
  });
};

process.env.AVANTIQO_MUSIC_TRANSFORM_CAPABILITY = "ai.audio.extend";
process.env.AVANTIQO_MUSIC_TRANSFORM_SOURCE_MODE = "MUSICAL_CONTINUITY";
process.env.AVANTIQO_MUSIC_CONTINUITY_FIXTURE_PROFILE = "DYNAMIC_METAL";

await import("./benchmark-avantiqo-music-transform.mjs");
