import { CreativeMusicSeparatorBenchmarkRuntime } from "./CreativeMusicSeparatorBenchmarkRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_SELECTION_V1";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

export function selectMusicSeparator({
  objective = "stem_separation",
  benchmark_results = [],
  certified_models = [],
  source_kind = "UNKNOWN",
} = {}) {
  const certified = new Set(certified_models.map(text).filter(Boolean));
  const rows = benchmark_results
    .filter((row) => row && text(row.model_id))
    .map((row) => ({
      ...row,
      score: finite(row.score, 0),
      certified: certified.has(text(row.model_id)),
      promotion_eligible: row.promotion_eligible === true,
    }))
    .sort((a, b) => b.score - a.score);

  const eligible = rows.filter((row) => row.certified && row.promotion_eligible && row.score >= 92);
  const selected = eligible[0] || null;
  const baseline = CreativeMusicSeparatorBenchmarkRuntime.baseline;
  const needsLeadVsBacking = ["vocal_role_separation"].includes(text(objective));

  if (needsLeadVsBacking && !selected) {
    return {
      contract: CONTRACT,
      objective: text(objective),
      source_kind: text(source_kind).toUpperCase(),
      executable: false,
      selected_model: null,
      fallback_model: null,
      blockers: ["CERTIFIED_VOCAL_ROLE_SEPARATOR_REQUIRED"],
      ordinary_four_stem_fallback_forbidden: true,
      human_review_required: true,
    };
  }

  return {
    contract: CONTRACT,
    objective: text(objective),
    source_kind: text(source_kind).toUpperCase(),
    executable: Boolean(selected) || !needsLeadVsBacking,
    selected_model: selected ? text(selected.model_id) : baseline.id,
    selected_score: selected?.score ?? null,
    fallback_model: selected ? baseline.id : null,
    baseline_used: !selected,
    benchmark_promotion_required: !selected,
    human_review_required: true,
    review_dimensions: CreativeMusicSeparatorBenchmarkRuntime.dimensions.map((item) => item.id),
    reject_if_lead_vocal_leakage_over_percent: 10,
    reject_if_instrumental_damage_over_percent: 10,
  };
}

export const CreativeMusicSeparatorSelectionRuntime = Object.freeze({
  contract: CONTRACT,
  select: selectMusicSeparator,
});
