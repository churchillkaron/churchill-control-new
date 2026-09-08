import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CREATIVE_TRAINING_CANDIDATE_CONTRACT } from "./CreativeTrainingCandidateRuntime";

export const CREATIVE_PREFERENCE_LEARNING_CONTRACT = "AVANTIQO_CREATIVE_PREFERENCE_LEARNING_V1";
const TRAINING_SCOPE = "platform_training_candidates";
const CANDIDATE_KIND = "CREATIVE_PREFERENCE_PAIR";
const MIN_RECURRENT_SAMPLE = 3;

function text(value, limit = 800) { return String(value ?? "").trim().slice(0, limit); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function learningOrganizationId() { return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160); }

function normalize(row = {}) {
  const metadata = object(row.metadata);
  return {
    failure_family: list(metadata.failure_family).map((item) => text(item, 120)).filter(Boolean),
    preferred_scores: object(metadata.preferred?.scores),
    dispreferred_scores: object(metadata.dispreferred?.scores),
    repaired_preferred: metadata.preferred?.repaired === true,
    benchmark_status: text(metadata.benchmark_status, 80) || "UNREVIEWED",
  };
}

function delta(a, b, key) {
  const left = finite(a?.[key]);
  const right = finite(b?.[key]);
  return left === null || right === null ? null : left - right;
}

function summarize(items = []) {
  const failures = new Map();
  let cinematicTotal = 0;
  let cinematicCount = 0;
  let weakestTotal = 0;
  let weakestCount = 0;
  let repairedWinnerCount = 0;
  for (const item of items) {
    for (const failure of item.failure_family) failures.set(failure, (failures.get(failure) || 0) + 1);
    const cinematic = delta(item.preferred_scores, item.dispreferred_scores, "cinematic");
    const weakest = delta(item.preferred_scores, item.dispreferred_scores, "weakest");
    if (cinematic !== null) { cinematicTotal += cinematic; cinematicCount += 1; }
    if (weakest !== null) { weakestTotal += weakest; weakestCount += 1; }
    if (item.repaired_preferred) repairedWinnerCount += 1;
  }
  const recurrent = [...failures.entries()]
    .filter(([, count]) => count >= MIN_RECURRENT_SAMPLE)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([failure_family, sample_count]) => ({ failure_family, sample_count }));
  return {
    contract: CREATIVE_PREFERENCE_LEARNING_CONTRACT,
    evidence_status: items.length >= MIN_RECURRENT_SAMPLE
      ? "STRUCTURAL_PREFERENCE_EVIDENCE_AVAILABLE"
      : "INSUFFICIENT_RECURRENT_PREFERENCE_EVIDENCE",
    preference_pair_count: items.length,
    recurrent_failure_patterns: recurrent,
    average_winner_cinematic_delta: cinematicCount ? Number((cinematicTotal / cinematicCount).toFixed(3)) : null,
    average_winner_weakest_dimension_delta: weakestCount ? Number((weakestTotal / weakestCount).toFixed(3)) : null,
    repaired_winner_count: repairedWinnerCount,
    interpretation: {
      evidence_role: "ADVISORY_STRUCTURAL_PRIOR",
      minimum_recurrent_sample: MIN_RECURRENT_SAMPLE,
      prior_creative_content_available: false,
      imitation_allowed: false,
      style_copying_allowed: false,
      quality_floor_override_allowed: false,
      provider_routing_override_allowed: false,
      human_approval_override_allowed: false,
    },
  };
}

export const CreativePreferenceLearningRuntime = Object.freeze({
  contract: CREATIVE_PREFERENCE_LEARNING_CONTRACT,
  async resolve({ limit = 200 } = {}) {
    const learningOrganization = learningOrganizationId();
    if (!learningOrganization) return { summary: summarize([]), status: "DISABLED", items: [], provider_execution: false };
    const result = await supabaseAdmin
      .from("intelligence_memories")
      .select("id,metadata,updated_at")
      .eq("organization_id", learningOrganization)
      .eq("memory_scope", TRAINING_SCOPE)
      .eq("active", true)
      .eq("source", "creative_verified_preference_training_candidate")
      .order("updated_at", { ascending: false })
      .limit(Math.max(1, Math.min(500, Number(limit) || 200)));
    if (result.error) throw result.error;
    const items = list(result.data)
      .filter((row) => object(row.metadata).contract === CREATIVE_TRAINING_CANDIDATE_CONTRACT)
      .filter((row) => object(row.metadata).candidate_kind === CANDIDATE_KIND)
      .map(normalize);
    const summary = summarize(items);
    return { current: summary, summary, status: summary.evidence_status, items, read_only_learning: true, provider_execution: false };
  },
  summarize,
});
