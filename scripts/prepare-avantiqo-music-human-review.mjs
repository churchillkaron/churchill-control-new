import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_CERTIFICATION_BENCHMARK_V3";
const ECONOMICS_CONTRACT = "AVANTIQO_MUSIC_ECONOMICS_V1";
const REVIEW_CONTRACT = "AVANTIQO_MUSIC_HUMAN_REVIEW_V1";

const BENCHMARK_INPUT = resolve(
  process.env.AVANTIQO_AUDIO_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-music-certification-benchmark.json",
);
const ECONOMICS_INPUT = resolve(
  process.env.AVANTIQO_AUDIO_ECONOMICS_OUTPUT ||
    "/tmp/avantiqo-music-economics.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_MUSIC_HUMAN_REVIEW_OUTPUT ||
    "/tmp/avantiqo-music-human-review.json",
);

function text(value) {
  return String(value ?? "").trim();
}

const [benchmark, economics] = await Promise.all([
  readFile(BENCHMARK_INPUT, "utf8").then(JSON.parse),
  readFile(ECONOMICS_INPUT, "utf8").then(JSON.parse),
]);

if (text(benchmark?.contract) !== BENCHMARK_CONTRACT || benchmark?.summary?.passed !== true) {
  throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_REQUIRES_PASSED_BENCHMARK_V3");
}
if (text(economics?.contract) !== ECONOMICS_CONTRACT || economics?.certification?.economics_measured !== true) {
  throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_REQUIRES_MEASURED_ECONOMICS");
}
if (text(economics?.source_benchmark_id) !== text(benchmark?.benchmark_id)) {
  throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_EVIDENCE_ID_MISMATCH");
}

const observations = Array.isArray(benchmark.observations) ? benchmark.observations : [];
if (!observations.length) throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_OBSERVATIONS_REQUIRED");

const criteria = Object.freeze([
  {
    criterion: "musical_coherence",
    label: "Musical coherence",
    minimum_score: 88,
    guidance: "Composition feels intentional, harmonically and rhythmically coherent, without random or broken passages.",
  },
  {
    criterion: "arrangement_and_structure",
    label: "Arrangement and structure",
    minimum_score: 86,
    guidance: "The requested intro, development, lift and resolution feel naturally structured rather than mechanically stitched.",
  },
  {
    criterion: "sound_quality_and_artifacts",
    label: "Sound quality and artifacts",
    minimum_score: 90,
    guidance: "No clipping, digital tearing, harsh discontinuities, phase-like collapse, obvious generation glitches or unusable noise.",
  },
  {
    criterion: "musical_direction_adherence",
    label: "Direction adherence",
    minimum_score: 86,
    guidance: "The audible result materially matches the requested cinematic premium instrumental direction, tempo and intended energy.",
  },
  {
    criterion: "instrumental_integrity",
    label: "Instrumental integrity",
    minimum_score: 95,
    guidance: "No unintended intelligible vocals or vocal fragments are present in the certified instrumental generation lane.",
  },
  {
    criterion: "transition_quality",
    label: "Transition quality",
    minimum_score: 86,
    guidance: "Section changes and musical transitions are smooth, purposeful and release-usable.",
  },
  {
    criterion: "commercial_release_readiness",
    label: "Commercial release readiness",
    minimum_score: 88,
    guidance: "The composition is strong enough to use in a professional Avantiqo client production after the canonical mastering stage.",
  },
]);

const measuredByRun = new Map(
  (Array.isArray(economics.measured) ? economics.measured : [])
    .map((item) => [Number(item.run), item]),
);

const review = {
  contract: REVIEW_CONTRACT,
  generated_at: new Date().toISOString(),
  source_scope: "BENCHMARK_ONLY",
  benchmark_contract: BENCHMARK_CONTRACT,
  benchmark_id: benchmark.benchmark_id || null,
  economics_contract: ECONOMICS_CONTRACT,
  provider: "avantiqo-audio",
  capability: "ai.music.generate",
  model: "ACE-Step/Ace-Step1.5",
  model_family: "ACE_STEP_1_5",
  model_variant: "acestep-v15-turbo",
  review_status: "PENDING",
  reviewer: "",
  reviewed_at: null,
  minimum_average_score: 90,
  automatic_human_approval_forbidden: true,
  activation_allowed: false,
  items: observations.map((observation) => ({
    run: observation.run,
    usage_id: observation.usage_id || null,
    storage_reference: observation.storage_reference || null,
    review_url: observation.review_url || null,
    duration_seconds: observation.duration_seconds || null,
    bpm: 92,
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
  runs: review.items.length,
  review_status: "PENDING",
  automatic_human_approval_forbidden: true,
  activation_allowed: false,
}, null, 2));
