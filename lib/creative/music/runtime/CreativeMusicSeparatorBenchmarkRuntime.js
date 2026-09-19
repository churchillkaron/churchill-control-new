const CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_V1";
const BASELINE = Object.freeze({
  id: "demucs-htdemucs-ft",
  family: "DEMUCS",
  status: "PRODUCTION_BASELINE",
  quality_profile: "DEMUCS_HTDEMUCS_FT_4STEM_V1",
});
const CANDIDATES = Object.freeze([
  Object.freeze({
    id: "melband-roformer-kim-vocals",
    family: "MELBAND_ROFORMER",
    status: "BENCHMARK_REQUIRED",
    source: "openmirlab/melband-roformer-infer",
    license: "MIT",
    target: "VOCALS_INSTRUMENTAL_QUALITY_UPGRADE",
  }),
]);
const DIMENSIONS = Object.freeze([
  Object.freeze({ id: "lead_vocal_leakage", weight: 0.2, direction: "LOWER_IS_BETTER" }),
  Object.freeze({ id: "backing_vocal_preservation", weight: 0.2, direction: "HIGHER_IS_BETTER" }),
  Object.freeze({ id: "instrumental_damage", weight: 0.18, direction: "LOWER_IS_BETTER" }),
  Object.freeze({ id: "transient_preservation", weight: 0.12, direction: "HIGHER_IS_BETTER" }),
  Object.freeze({ id: "stereo_image_integrity", weight: 0.1, direction: "HIGHER_IS_BETTER" }),
  Object.freeze({ id: "human_listening_quality", weight: 0.12, direction: "HIGHER_IS_BETTER" }),
  Object.freeze({ id: "runtime_cost_efficiency", weight: 0.04, direction: "HIGHER_IS_BETTER" }),
  Object.freeze({ id: "runtime_speed", weight: 0.04, direction: "HIGHER_IS_BETTER" }),
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clamp100(value) { return Math.max(0, Math.min(100, finite(value, 0))); }
export function scoreMusicSeparatorBenchmark(result = {}) {
  const scores = {};
  let weighted = 0;
  for (const dimension of DIMENSIONS) {
    const raw = clamp100(result[dimension.id]);
    const normalized = dimension.direction === "LOWER_IS_BETTER" ? 100 - raw : raw;
    scores[dimension.id] = raw;
    weighted += normalized * dimension.weight;
  }
  const score = Math.round(weighted * 1000) / 1000;
  const hardGates = {
    human_listening_quality: clamp100(result.human_listening_quality) >= 90,
    instrumental_damage: clamp100(result.instrumental_damage) <= 10,
    lead_vocal_leakage: clamp100(result.lead_vocal_leakage) <= 10,
    backing_vocal_preservation: clamp100(result.backing_vocal_preservation) >= 90,
    independent_review: result.independent_review_passed === true,
  };
  return { contract: CONTRACT, score, scores, hard_gates: hardGates, promotion_eligible: score >= 92 && Object.values(hardGates).every(Boolean) };
}
export function planMusicSeparatorBenchmark({ candidate_id } = {}) {
  const candidate = CANDIDATES.find((entry) => entry.id === candidate_id);
  if (!candidate) throw new Error(`CREATIVE_MUSIC_SEPARATOR_CANDIDATE_NOT_FOUND:${candidate_id || "MISSING"}`);
  return {
    contract: CONTRACT,
    baseline: BASELINE,
    candidate,
    dimensions: DIMENSIONS,
    source_set_required: true,
    minimum_reference_tracks: 12,
    minimum_genres: 6,
    human_listening_panel_required: true,
    independent_review_required: true,
    production_promotion_automatic: false,
    production_baseline_preserved: true,
  };
}

export const CreativeMusicSeparatorBenchmarkRuntime = Object.freeze({
  contract: CONTRACT,
  baseline: BASELINE,
  candidates: CANDIDATES,
  dimensions: DIMENSIONS,
  plan: planMusicSeparatorBenchmark,
  score: scoreMusicSeparatorBenchmark,
});
