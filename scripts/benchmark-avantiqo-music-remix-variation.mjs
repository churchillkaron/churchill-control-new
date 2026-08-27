#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  AVANTIQO_MUSIC_CONTINUITY_FIXTURE_BPM,
  AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS,
  AVANTIQO_MUSIC_METAL_CONTINUITY_FIXTURE_CONTRACT,
  avantiqoMusicContinuityFixtureMetadata,
  createAvantiqoMusicDynamicMetalContinuityFixtureWav,
} from "./avantiqo-music-continuity-fixture.mjs";

const BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_BENCHMARK_V2";
const REMIX_REVIEW_KIND = "MUSICAL_VARIATION";
const REMIX_SOURCE_MODE = "MUSICAL_VARIATION";
const EXPECTED_CAPABILITY = "ai.audio.remix";
const EXPECTED_TASK_TYPE = "cover";
const EXPECTED_COVER_STRENGTH = 0.6;
const SAFE_LEASE_LANE = "music-transform-candidate";
const METAL_CAPTION = "Original dynamic heavy metal instrumental source reimagined as a clearly alternate arrangement with fresh rhythmic phrasing, changed section emphasis and new guitar voicings while preserving the recognizable E-minor musical identity, pulse and core motif; create only new original material and do not imitate any artist or recording";

const text = (value) => String(value ?? "").trim();
const closeEnough = (left, right, tolerance = 0.001) => Math.abs(Number(left) - Number(right)) <= tolerance;

process.env.AVANTIQO_MUSIC_TRANSFORM_CAPABILITY = EXPECTED_CAPABILITY;
process.env.AVANTIQO_MUSIC_TRANSFORM_SOURCE_MODE = "TECHNICAL_SYNTHETIC";
process.env.AVANTIQO_MUSIC_CONTINUITY_FIXTURE_PROFILE = "DYNAMIC_METAL";

const reportPath = resolve(
  text(process.env.AVANTIQO_MUSIC_TRANSFORM_BENCHMARK_OUTPUT)
    || `/tmp/music-remix-variation-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.json`,
);
process.env.AVANTIQO_MUSIC_TRANSFORM_BENCHMARK_OUTPUT = reportPath;

const metalFixture = createAvantiqoMusicDynamicMetalContinuityFixtureWav();
const metalMetadata = avantiqoMusicContinuityFixtureMetadata();
if (
  text(metalMetadata?.profile) !== "DYNAMIC_METAL" ||
  text(metalMetadata?.profile_contract) !== AVANTIQO_MUSIC_METAL_CONTINUITY_FIXTURE_CONTRACT ||
  metalMetadata?.original_composition !== true ||
  metalMetadata?.royalty_free !== true
) {
  throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_SOURCE_FIXTURE_NOT_RIGHTS_SAFE");
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch !== "function") throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_FETCH_REQUIRED");

let capturedCompletedOutput = null;
let sourceUploadReplaced = false;
let generationSubmitObserved = false;

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : String(input?.url || input);
  const method = text(init?.method || "GET").toUpperCase();
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.split("?", 1)[0];
  }
  const isDirectStorageObjectPath = pathname.includes("/storage/v1/object/")
    && !pathname.includes("/storage/v1/object/sign/")
    && !pathname.includes("/storage/v1/object/upload/sign/");
  const isSourceUpload = method === "POST"
    && isDirectStorageObjectPath
    && /-source\.wav$/i.test(pathname);

  if (isSourceUpload) {
    sourceUploadReplaced = true;
    console.log("AVANTIQO_MUSIC_REMIX_VARIATION_SOURCE_UPLOAD=ORIGINAL_DYNAMIC_METAL_FIXTURE");
    return originalFetch(input, {
      ...init,
      body: metalFixture,
    });
  }

  const isRunpodGenerationSubmit = /https:\/\/api\.runpod\.ai\/v2\/[^/]+\/run$/i.test(url);
  if (isRunpodGenerationSubmit && init?.body !== undefined) {
    let envelope;
    try {
      envelope = JSON.parse(String(init.body));
    } catch {
      throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_RUNPOD_ENVELOPE_INVALID");
    }

    const jobInput = envelope?.input;
    const music = jobInput?.structured_specification?.music;
    const providerParameters = jobInput?.structured_specification?.provider_parameters;
    const certification = jobInput?.certification;
    if (!jobInput || !music || !providerParameters || !certification) {
      throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_RUNPOD_PAYLOAD_INVALID");
    }
    if (jobInput.capability !== EXPECTED_CAPABILITY) {
      throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_REMIX_CAPABILITY_REQUIRED");
    }
    if (certification.scope !== "music-transform-only" || certification.candidate !== true) {
      throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_CANDIDATE_CERTIFICATION_REQUIRED");
    }
    if (certification.max_provider_jobs !== 1 || certification.benchmark_runs !== 1) {
      throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_ONE_JOB_CONTRACT_REQUIRED");
    }
    if (
      certification.production_activation_allowed !== false ||
      certification.pricing_activation_allowed !== false ||
      certification.provider_selection_change_allowed !== false
    ) {
      throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_RELEASE_MUTATION_FORBIDDEN");
    }

    music.caption = METAL_CAPTION;
    music.instrumental = true;
    music.duration_seconds = AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS;
    music.bpm = AVANTIQO_MUSIC_CONTINUITY_FIXTURE_BPM;
    music.test_profile = "DYNAMIC_METAL_REMIX_VARIATION";
    music.source_fixture_original = true;
    music.external_reference_recording_used = false;
    music.artist_imitation_requested = false;
    providerParameters.audio_cover_strength = EXPECTED_COVER_STRENGTH;

    generationSubmitObserved = true;
    console.log("AVANTIQO_MUSIC_REMIX_VARIATION_CAPTION=ORIGINAL_DYNAMIC_METAL_ALTERNATE_ARRANGEMENT");
    console.log("AVANTIQO_MUSIC_REMIX_VARIATION_EXTERNAL_REFERENCE_RECORDING_USED=false");
    console.log("AVANTIQO_MUSIC_REMIX_VARIATION_ARTIST_IMITATION_REQUESTED=false");
    console.log(`AVANTIQO_MUSIC_REMIX_VARIATION_COVER_STRENGTH=${EXPECTED_COVER_STRENGTH}`);

    return originalFetch(input, {
      ...init,
      body: JSON.stringify(envelope),
    });
  }

  const response = await originalFetch(input, init);
  const isRunpodStatus = /https:\/\/api\.runpod\.ai\/v2\/[^/]+\/status\/[^/?]+/i.test(url);
  if (isRunpodStatus) {
    try {
      const body = await response.clone().json();
      if (text(body?.status).toUpperCase() === "COMPLETED") capturedCompletedOutput = body?.output || null;
    } catch {
      // The underlying benchmark owns response parsing and failure handling.
    }
  }
  return response;
};

await import("./benchmark-avantiqo-music-transform.mjs");

globalThis.fetch = originalFetch;

const baseReport = JSON.parse(await readFile(reportPath, "utf8"));
const output = capturedCompletedOutput || {};
const remixTechnicalProven =
  sourceUploadReplaced === true &&
  generationSubmitObserved === true &&
  baseReport?.contract === BENCHMARK_CONTRACT &&
  baseReport?.passed === true &&
  text(baseReport?.capability) === EXPECTED_CAPABILITY &&
  baseReport?.provider_jobs_submitted === 1 &&
  text(baseReport?.safe_lease_lane) === SAFE_LEASE_LANE &&
  text(output?.capability) === EXPECTED_CAPABILITY &&
  text(output?.task_type) === EXPECTED_TASK_TYPE &&
  output?.source_audio_used === true &&
  closeEnough(output?.audio_cover_strength, EXPECTED_COVER_STRENGTH) &&
  output?.certification_candidate === true &&
  output?.production_certified === false &&
  output?.activation_allowed === false &&
  Number(output?.size_bytes) > 10_000;

const report = {
  ...baseReport,
  source_mode: REMIX_SOURCE_MODE,
  source_fixture: {
    ...metalMetadata,
    remix_source_role: "ORIGINAL_RIGHTS_SAFE_FIXTURE",
    remix_expectation: "CREATE_CLEAR_ALTERNATE_ARRANGEMENT_WITH_NEW_ORIGINAL_MATERIAL_WHILE_PRESERVING_RECOGNIZABLE_MUSICAL_IDENTITY",
    external_reference_recording_used: false,
    artist_imitation_requested: false,
  },
  source_duration_seconds: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS,
  remix_variation_technical_proven: remixTechnicalProven,
  human_review_required: true,
  human_review_status: "PENDING",
  human_review_kind: REMIX_REVIEW_KIND,
  eligible_for_human_release_review: remixTechnicalProven,
  production_activation_allowed: false,
  pricing_activation_allowed: false,
  provider_selection_change_allowed: false,
  passed: remixTechnicalProven,
  musical_quality_review_criteria: [
    "RECOGNIZABLE_SOURCE_IDENTITY_RETAINED",
    "CLEAR_ALTERNATE_ARRANGEMENT_CREATED",
    "NEW_ORIGINAL_MATERIAL_PRESENT",
    "RHYTHMIC_AND_SECTION_VARIATION_MUSICAL",
    "NO_MAJOR_TRANSITION_OR_AUDIO_ARTIFACTS",
    "NOT_A_NEAR_COPY_OF_SOURCE",
  ],
  output: {
    ...baseReport.output,
    task_type: output?.task_type ?? baseReport?.output?.task_type ?? null,
    audio_cover_strength: output?.audio_cover_strength ?? null,
    source_audio_used: output?.source_audio_used ?? baseReport?.output?.source_audio_used ?? null,
    size_bytes: output?.size_bytes ?? baseReport?.output?.size_bytes ?? null,
  },
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: remixTechnicalProven,
  contract: "AVANTIQO_MUSIC_REMIX_VARIATION_BENCHMARK_V1",
  benchmark_contract: BENCHMARK_CONTRACT,
  capability: EXPECTED_CAPABILITY,
  source_mode: REMIX_SOURCE_MODE,
  source_profile: text(metalMetadata?.profile),
  task_type: text(output?.task_type),
  audio_cover_strength: output?.audio_cover_strength ?? null,
  remix_variation_technical_proven: remixTechnicalProven,
  human_review_kind: REMIX_REVIEW_KIND,
  human_review_status: "PENDING",
  eligible_for_human_release_review: remixTechnicalProven,
  provider_jobs_submitted: baseReport?.provider_jobs_submitted ?? null,
  production_activation_performed: false,
  pricing_activation_performed: false,
  output_path: reportPath,
}, null, 2));

process.exitCode = remixTechnicalProven ? 0 : 1;
