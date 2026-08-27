import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT,
  AVANTIQO_SELECTION_POLICY_SHADOW_REVIEW_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyShadowChallengerRuntime";

export const AVANTIQO_SELECTION_POLICY_SHADOW_EVALUATION_INTEGRITY_CONTRACT =
  "AVANTIQO_SELECTION_POLICY_SHADOW_EVALUATION_INTEGRITY_V1";

const MEMORY_TABLE = "intelligence_memories";
const SHADOW_EVALUATION_SCOPE =
  "platform_learning_experiment_selection_policy_shadow_evaluations";
const CHALLENGER_POLICY_VERSION = "EMPIRICAL_CONSERVATIVE_CALIBRATION_V1";
const MIN_REVIEW_CYCLES = 3;
const MIN_REVIEW_PAIRS = 5;
const MIN_REVIEW_DISTINCT_EXPERIMENTS = 3;
const MIN_CHALLENGER_CORRECT_RATE = 0.67;
const MIN_CHALLENGER_RATE_ADVANTAGE = 0.15;
const REVIEW_VALIDITY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 5000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(list(values).map((value) => text(value, 2000)).filter(Boolean))];
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function plusDays(value, days) {
  return new Date(Date.parse(value) + days * DAY_MS).toISOString();
}

function validEvaluation(row) {
  const metadata = object(row?.metadata);
  return Boolean(
    row?.active === true &&
      text(metadata.contract, 180) ===
        AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT &&
      text(metadata.status, 180) ===
        "PROSPECTIVE_SHADOW_CHALLENGER_EVALUATED" &&
      metadata.prospective_shadow_only === true &&
      metadata.unexecuted_candidate_outcome_inferred === false &&
      metadata.historical_counterfactual_backtest_claimed === false &&
      Number(metadata.observed_candidate_count) >= 2 &&
      Number(metadata.comparable_pair_count) > 0 &&
      Boolean(text(metadata.evaluation_fingerprint, 128)) &&
      Boolean(text(metadata.snapshot_fingerprint, 128)) &&
      Boolean(text(metadata.selection_cycle_fingerprint, 128))
  );
}

function evaluationTimestamp(row) {
  const metadata = object(row?.metadata);
  return Math.max(
    Date.parse(text(metadata.evaluated_at, 120)) || 0,
    Date.parse(text(row?.updated_at, 120)) || 0,
    Date.parse(text(row?.created_at, 120)) || 0,
  );
}

function compareAuthority(left, right) {
  const leftMetadata = object(left.metadata);
  const rightMetadata = object(right.metadata);
  const observedDelta =
    Number(rightMetadata.observed_candidate_count || 0) -
    Number(leftMetadata.observed_candidate_count || 0);
  if (observedDelta !== 0) return observedDelta;

  const pairDelta =
    Number(rightMetadata.comparable_pair_count || 0) -
    Number(leftMetadata.comparable_pair_count || 0);
  if (pairDelta !== 0) return pairDelta;

  const timestampDelta = evaluationTimestamp(right) - evaluationTimestamp(left);
  if (timestampDelta !== 0) return timestampDelta;

  return text(rightMetadata.evaluation_fingerprint, 128).localeCompare(
    text(leftMetadata.evaluation_fingerprint, 128),
  );
}

function authoritativeEvaluations(rows) {
  const byCycle = new Map();
  for (const row of list(rows).filter(validEvaluation)) {
    const cycle = text(object(row.metadata).selection_cycle_fingerprint, 128);
    if (!byCycle.has(cycle)) byCycle.set(cycle, []);
    byCycle.get(cycle).push(row);
  }

  const authoritative = [];
  const redundant = [];
  for (const cycleRows of byCycle.values()) {
    const sorted = [...cycleRows].sort(compareAuthority);
    if (sorted.length) authoritative.push(sorted[0]);
    if (sorted.length > 1) redundant.push(...sorted.slice(1));
  }

  return {
    authoritative,
    redundant,
  };
}

async function loadEvaluations(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", SHADOW_EVALUATION_SCOPE)
    .eq("active", true)
    .limit(MAX_ROWS);
  if (result.error) throw result.error;
  return list(result.data);
}

async function retireRedundantEvaluations(rows, authoritativeByCycle, nowIso) {
  let retired = 0;
  for (const row of rows) {
    const metadata = object(row.metadata);
    const cycle = text(metadata.selection_cycle_fingerprint, 128);
    const authoritative = authoritativeByCycle.get(cycle);
    const authoritativeMetadata = object(authoritative?.metadata);
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        active: false,
        forgotten_at: nowIso,
        updated_at: nowIso,
        metadata: {
          ...metadata,
          phase30_integrity_contract:
            AVANTIQO_SELECTION_POLICY_SHADOW_EVALUATION_INTEGRITY_CONTRACT,
          phase30_integrity_status:
            "REDUNDANT_INCREMENTAL_EVALUATION_SUPERSEDED",
          phase30_authoritative_evaluation_per_cycle: false,
          phase30_superseded_by_evaluation_fingerprint: text(
            authoritativeMetadata.evaluation_fingerprint,
            128,
          ),
          phase30_integrity_reconciled_at: nowIso,
        },
      })
      .eq("id", row.id)
      .eq("active", true)
      .select("id");
    if (result.error) throw result.error;
    if (list(result.data).length === 1) retired += 1;
  }
  return retired;
}

function hardenedReviewRow({
  organizationId,
  authoritative,
  redundantCount,
  nowIso,
}) {
  const valid = list(authoritative).filter(validEvaluation);
  const distinctCycles = unique(
    valid.map((row) => object(row.metadata).selection_cycle_fingerprint),
  );
  const distinctSnapshots = unique(
    valid.map((row) => object(row.metadata).snapshot_fingerprint),
  );
  const distinctExperiments = unique(
    valid.flatMap((row) =>
      list(object(row.metadata).observed_experiment_fingerprints),
    ),
  );
  const pairCount = valid.reduce(
    (sum, row) => sum + Number(object(row.metadata).comparable_pair_count || 0),
    0,
  );
  const baselineCorrect = valid.reduce(
    (sum, row) =>
      sum + Number(object(row.metadata).baseline_pairwise_correct_count || 0),
    0,
  );
  const challengerCorrect = valid.reduce(
    (sum, row) =>
      sum + Number(object(row.metadata).challenger_pairwise_correct_count || 0),
    0,
  );
  const baselineRate = ratio(baselineCorrect, pairCount);
  const challengerRate = ratio(challengerCorrect, pairCount);
  const challengerWorseCycleCount = valid.filter(
    (row) => text(object(row.metadata).cycle_winner, 40) === "BASELINE",
  ).length;
  const mature = Boolean(
    distinctCycles.length >= MIN_REVIEW_CYCLES &&
      pairCount >= MIN_REVIEW_PAIRS &&
      distinctExperiments.length >= MIN_REVIEW_DISTINCT_EXPERIMENTS
  );
  const reviewCandidate = Boolean(
    mature &&
      challengerRate >= MIN_CHALLENGER_CORRECT_RATE &&
      challengerRate - baselineRate >= MIN_CHALLENGER_RATE_ADVANTAGE &&
      challengerWorseCycleCount === 0
  );
  const reviewFingerprint = digest(
    "selection-policy-shadow-review",
    CHALLENGER_POLICY_VERSION,
  );

  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_SELECTION_POLICY_SHADOW_REVIEW_SCOPE,
    memory_key: `selection-policy-shadow-review:${reviewFingerprint.slice(0, 40)}`,
    memory_type: reviewCandidate ? "lesson" : "evidence",
    subject: `Selection policy shadow review ${CHALLENGER_POLICY_VERSION}`,
    content:
      "Integrity-hardened prospective shadow review. Exactly one most-complete authoritative evaluation contributes per selection cycle, so incremental outcome arrival cannot inflate maturity, pair counts or promotion evidence. This remains review evidence only and cannot promote the challenger automatically.",
    importance: reviewCandidate ? 0.99 : 0.9,
    confidence: mature ? 0.97 : 0.72,
    source: "selection_policy_shadow_evaluation_integrity_hardening",
    active: true,
    valid_until: plusDays(nowIso, REVIEW_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT,
      status: reviewCandidate
        ? "SHADOW_CHALLENGER_PROMOTION_REVIEW_CANDIDATE"
        : mature
          ? "SHADOW_CHALLENGER_MATURE_NO_PROMOTION_RECOMMENDATION"
          : "SHADOW_CHALLENGER_EVIDENCE_INSUFFICIENT",
      review_fingerprint: reviewFingerprint,
      challenger_policy_version: CHALLENGER_POLICY_VERSION,
      evaluation_count: valid.length,
      distinct_selection_cycle_count: distinctCycles.length,
      distinct_snapshot_count: distinctSnapshots.length,
      comparable_pair_count: pairCount,
      distinct_experiment_count: distinctExperiments.length,
      baseline_pairwise_correct_rate: baselineRate,
      challenger_pairwise_correct_rate: challengerRate,
      challenger_correct_rate_advantage: challengerRate - baselineRate,
      challenger_worse_cycle_count: challengerWorseCycleCount,
      mature_shadow_evidence: mature,
      promotion_review_candidate: reviewCandidate,
      minimum_review_cycles: MIN_REVIEW_CYCLES,
      minimum_review_pairs: MIN_REVIEW_PAIRS,
      minimum_review_distinct_experiments: MIN_REVIEW_DISTINCT_EXPERIMENTS,
      minimum_challenger_correct_rate: MIN_CHALLENGER_CORRECT_RATE,
      minimum_challenger_rate_advantage: MIN_CHALLENGER_RATE_ADVANTAGE,
      zero_challenger_worse_cycles_required: true,
      phase30_integrity_contract:
        AVANTIQO_SELECTION_POLICY_SHADOW_EVALUATION_INTEGRITY_CONTRACT,
      authoritative_one_evaluation_per_selection_cycle: true,
      authoritative_selection_prefers_most_observed_candidates: true,
      authoritative_selection_then_prefers_most_comparable_pairs: true,
      authoritative_selection_then_prefers_newest_evaluation: true,
      incremental_evaluation_versions_count_once: true,
      redundant_incremental_evaluation_count: redundantCount,
      maturity_uses_authoritative_evaluations_only: true,
      automatic_policy_promotion: false,
      explicit_separate_policy_promotion_governance_required: true,
      live_policy_mutated: false,
      live_selection_mutated: false,
      numeric_selection_scores_mutated: false,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      authorization_value: "none",
      reconciled_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function upsertReview(row) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, {
      onConflict: "organization_id,memory_scope,memory_key",
    })
    .select("id,memory_key,metadata")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

export async function reconcileAvantiqoSelectionPolicyShadowEvaluationIntegrity({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_SELECTION_POLICY_SHADOW_EVALUATION_INTEGRITY_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      authoritative_evaluation_count: 0,
      redundant_evaluation_count: 0,
    };
  }

  const nowIso = new Date().toISOString();
  const evaluations = await loadEvaluations(organizationId);
  const { authoritative, redundant } = authoritativeEvaluations(evaluations);
  const authoritativeByCycle = new Map(
    authoritative.map((row) => [
      text(object(row.metadata).selection_cycle_fingerprint, 128),
      row,
    ]),
  );

  let retiredRedundantEvaluationCount = 0;
  let review = null;
  if (persist) {
    retiredRedundantEvaluationCount = await retireRedundantEvaluations(
      redundant,
      authoritativeByCycle,
      nowIso,
    );
    review = await upsertReview(
      hardenedReviewRow({
        organizationId,
        authoritative,
        redundantCount: redundant.length,
        nowIso,
      }),
    );
  }

  return {
    success: true,
    contract: AVANTIQO_SELECTION_POLICY_SHADOW_EVALUATION_INTEGRITY_CONTRACT,
    status: redundant.length
      ? "REDUNDANT_INCREMENTAL_SHADOW_EVALUATIONS_SUPERSEDED"
      : "SHADOW_EVALUATION_INTEGRITY_STABLE",
    active_evaluation_input_count: evaluations.length,
    authoritative_evaluation_count: authoritative.length,
    distinct_authoritative_selection_cycle_count: unique(
      authoritative.map(
        (row) => object(row.metadata).selection_cycle_fingerprint,
      ),
    ).length,
    redundant_evaluation_count: redundant.length,
    retired_redundant_evaluation_count: retiredRedundantEvaluationCount,
    review,
    integrity: {
      exactly_one_authoritative_evaluation_per_selection_cycle: true,
      authority_prefers_most_complete_then_newest: true,
      incremental_versions_cannot_inflate_maturity: true,
      promotion_review_recomputed_from_authoritative_only: true,
      automatic_policy_promotion: false,
      live_policy_mutated: false,
      live_selection_mutated: false,
      numeric_selection_scores_mutated: false,
      execution_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoSelectionPolicyShadowEvaluationIntegrityRuntime = Object.freeze({
  contract: AVANTIQO_SELECTION_POLICY_SHADOW_EVALUATION_INTEGRITY_CONTRACT,
  reconcile: reconcileAvantiqoSelectionPolicyShadowEvaluationIntegrity,
});
