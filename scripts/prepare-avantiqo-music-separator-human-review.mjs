#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_BENCHMARK_V1";
const ECONOMICS_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_V1";
const REVIEW_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_V1";
const EXPECTED_PROVIDER = "avantiqo-audio";
const EXPECTED_CAPABILITY = "ai.audio.stems";
const EXPECTED_CATALOG_MODEL = "facebookresearch/demucs:htdemucs_ft";
const EXPECTED_RUNTIME_MODEL = "demucs-htdemucs-ft";
const EXPECTED_QUALITY_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1";

const BENCHMARK_INPUT = resolve(
  process.env.AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-music-separator-certification-benchmark.json",
);
const ECONOMICS_INPUT = resolve(
  process.env.AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_OUTPUT ||
    "/tmp/avantiqo-music-separator-economics.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_OUTPUT ||
    "/tmp/avantiqo-music-separator-human-review.json",
);

function text(value) {
  return String(value ?? "").trim();
}

const [benchmark, economics] = await Promise.all([
  readFile(BENCHMARK_INPUT, "utf8").then(JSON.parse),
  readFile(ECONOMICS_INPUT, "utf8").then(JSON.parse),
]);

const benchmarkChecks = [
  text(benchmark?.contract) === BENCHMARK_CONTRACT,
  benchmark?.summary?.passed === true,
  text(benchmark?.provider) === EXPECTED_PROVIDER,
  text(benchmark?.capability) === EXPECTED_CAPABILITY,
  text(benchmark?.catalog_model) === EXPECTED_CATALOG_MODEL,
  text(benchmark?.runtime_model) === EXPECTED_RUNTIME_MODEL,
  text(benchmark?.quality_profile) === EXPECTED_QUALITY_PROFILE,
  benchmark?.certification?.runtime_benchmark_passed === true,
];
if (!benchmarkChecks.every(Boolean)) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_REQUIRES_PASSED_SEPARATOR_BENCHMARK");
}

const economicsChecks = [
  text(economics?.contract) === ECONOMICS_CONTRACT,
  economics?.certification?.economics_measured === true,
  text(economics?.source_benchmark_id) === text(benchmark?.benchmark_id),
  text(economics?.capability) === EXPECTED_CAPABILITY,
  text(economics?.runtime_model) === EXPECTED_RUNTIME_MODEL,
  text(economics?.quality_profile) === EXPECTED_QUALITY_PROFILE,
];
if (!economicsChecks.every(Boolean)) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_REQUIRES_MEASURED_SEPARATOR_ECONOMICS");
}

const observations = Array.isArray(benchmark.observations) ? benchmark.observations : [];
if (!observations.length) throw new Error("AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_OBSERVATIONS_REQUIRED");
const measuredByRun = new Map(
  (Array.isArray(economics.measured) ? economics.measured : [])
    .map((item) => [Number(item.run), item]),
);

const criteria = Object.freeze([
  {
    criterion: "vocal_removal_quality",
    label: "Vocal removal quality",
    minimum_score: 92,
    guidance: "Backing track has no distracting intelligible lead-vocal residue, vocal ghosting or obvious vocal fragments.",
  },
  {
    criterion: "instrumental_integrity",
    label: "Instrumental integrity",
    minimum_score: 90,
    guidance: "Drums, bass and accompaniment remain musically intact after vocal removal without destructive masking or hollow collapse.",
  },
  {
    criterion: "stem_isolation_quality",
    label: "Stem isolation quality",
    minimum_score: 88,
    guidance: "Vocals, drums, bass and other stems are usefully isolated with leakage low enough for professional editing and remix work.",
  },
  {
    criterion: "artifact_control",
    label: "Artifact control",
    minimum_score: 90,
    guidance: "No unacceptable metallic swirls, chirping, pumping, phase collapse, clipping, digital tearing or transient smearing.",
  },
  {
    criterion: "timing_and_arrangement_preservation",
    label: "Timing and arrangement preservation",
    minimum_score: 95,
    guidance: "Original timing, song structure and arrangement remain aligned; no dropped sections, time drift or unintended edits.",
  },
  {
    criterion: "backing_track_mix_quality",
    label: "Backing track mix quality",
    minimum_score: 90,
    guidance: "The drums+bass+other backing mix feels balanced and practical for live performance, rehearsal, karaoke or production use.",
  },
  {
    criterion: "delivery_quality",
    label: "Delivery quality",
    minimum_score: 92,
    guidance: "WAV and 320 kbps MP3 outputs are clean, complete and suitable for professional downstream use.",
  },
  {
    criterion: "commercial_music_studio_readiness",
    label: "Commercial Music Studio readiness",
    minimum_score: 90,
    guidance: "The complete result is strong enough to expose as an Avantiqo Music Studio backing-track/stems capability.",
  },
]);

const review = {
  contract: REVIEW_CONTRACT,
  generated_at: new Date().toISOString(),
  source_scope: "CONTROLLED_SEPARATOR_BENCHMARK_ONLY",
  benchmark_contract: BENCHMARK_CONTRACT,
  benchmark_id: benchmark.benchmark_id || null,
  economics_contract: ECONOMICS_CONTRACT,
  provider: EXPECTED_PROVIDER,
  capability: EXPECTED_CAPABILITY,
  catalog_model: EXPECTED_CATALOG_MODEL,
  runtime_model: EXPECTED_RUNTIME_MODEL,
  quality_profile: EXPECTED_QUALITY_PROFILE,
  rights_attestation_contract: benchmark?.rights_attestation?.contract || null,
  rights_attestation_confirmed: benchmark?.rights_attestation?.confirmed === true,
  review_status: "PENDING",
  reviewer: "",
  reviewed_at: null,
  minimum_average_score: 92,
  automatic_human_approval_forbidden: true,
  activation_allowed: false,
  items: observations.map((observation) => ({
    run: observation.run,
    runpod_job_id: observation.runpod_job_id || null,
    source_duration_seconds: observation.source_duration_seconds || null,
    source_storage_reference: observation.source_storage_reference || null,
    storage_references: observation.storage_references || {},
    stem_names: observation.stem_names || [],
    backing_track_stems: observation.backing_track_stems || [],
    quality_profile: observation.quality_profile || null,
    technical_benchmark_passed: observation.passed === true,
    economics: measuredByRun.get(Number(observation.run)) || null,
    review_status: "PENDING",
    reviewer: "",
    reviewed_at: null,
    notes: "",
    criteria: criteria.map((entry) => ({
      ...entry,
      status: "PENDING",
      score_0_100: null,
      evidence_note: "",
    })),
  })),
};

await writeFile(OUTPUT, `${JSON.stringify(review, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  output_path: OUTPUT,
  contract: REVIEW_CONTRACT,
  benchmark_id: review.benchmark_id,
  runs: review.items.length,
  review_status: "PENDING",
  minimum_average_score: review.minimum_average_score,
  automatic_human_approval_forbidden: true,
  activation_allowed: false,
}, null, 2));
