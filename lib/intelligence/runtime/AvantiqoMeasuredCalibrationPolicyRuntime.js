import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_MEASURED_CALIBRATION_POLICY_CONTRACT = "AVANTIQO_MEASURED_CALIBRATION_POLICY_V1";
const MEMORY_TABLE = "intelligence_memories";
const CALIBRATION_SCOPE = "platform_intelligence_calibration";
const OUTCOME_PATTERN_SCOPE = "platform_verified_outcome_patterns";
const CAPABILITY_COVERAGE_SCOPE = "platform_capability_intelligence_coverage";
const WEAK_THRESHOLD = 0.55;
const MAX_ROWS = 8;

function text(value, limit = 12000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function bounded(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback; }

export function deriveAvantiqoMeasuredCalibrationPolicy(rows = []) {
  const history = list(rows).map((row) => ({ ...row, metadata: object(row?.metadata) }));
  const latestScores = object(history[0]?.metadata?.dimension_scores);
  const dimensionHistory = new Map();
  for (const row of history) {
    for (const [dimension, rawScore] of Object.entries(object(row.metadata.dimension_scores))) {
      const scores = dimensionHistory.get(dimension) || [];
      scores.push(bounded(rawScore, 1));
      dimensionHistory.set(dimension, scores);
    }
  }
  const dimensions = [...dimensionHistory.entries()].map(([dimension, scores]) => {
    const recent = scores.slice(0, 4);
    const mean = recent.reduce((sum, score) => sum + score, 0) / Math.max(1, recent.length);
    const weakCount = recent.filter((score) => score < WEAK_THRESHOLD).length;
    const currentRaw = Number(latestScores[dimension]);
    const currentScore = Number.isFinite(currentRaw) ? bounded(currentRaw, 1) : null;
    return { dimension, current_score: currentScore, mean: Number(mean.toFixed(4)), weak_count: weakCount, samples: recent.length };
  }).sort((a, b) => (a.current_score ?? a.mean) - (b.current_score ?? b.mean) || b.weak_count - a.weak_count || a.dimension.localeCompare(b.dimension));
  const repeatedWeaknesses = dimensions.filter((item) => (item.current_score !== null && item.current_score < WEAK_THRESHOLD) || item.weak_count >= 2).slice(0, 6);
  const weak = new Set(repeatedWeaknesses.map((item) => item.dimension));
  const evidenceSensitive = ["evidence", "tool_selection", "correctness", "calibration"].some((item) => weak.has(item));
  const critiqueSensitive = ["planning", "recovery", "calibration", "governance", "completion", "evidence", "correctness"].some((item) => weak.has(item));
  return {
    contract: AVANTIQO_MEASURED_CALIBRATION_POLICY_CONTRACT,
    available: history.length > 0,
    source_row_count: history.length,
    repeated_weaknesses: repeatedWeaknesses,
    policy: {
      require_extra_critique: critiqueSensitive,
      prefer_cheap_authoritative_evidence_first: evidenceSensitive,
      reconcile_conflicting_evidence_before_commitment: true,
      stronger_owned_model_only_after_evidence_exhausted: true,
      external_specialist_requires_explicit_authorization: true,
      defer_low_value_uncertainty: true,
      difficulty_alone_never_justifies_escalation: true,
      automatic_external_spend: false,
      authority_effect: "NONE",
      mutation_authority_granted: false,
      confirmation_or_approval_bypass: false,
      safety_floor_reduction_allowed: false,
    },
  };
}

export async function loadAvantiqoMeasuredCalibrationPolicy({ organizationId } = {}) {
  const org = text(organizationId, 160);
  if (!org) return deriveAvantiqoMeasuredCalibrationPolicy([]);
  const [result, patternResult, coverageResultA, coverageResultB] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,metadata,updated_at")
      .eq("organization_id", org)
      .eq("memory_scope", CALIBRATION_SCOPE)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("subject,metadata,updated_at")
      .eq("organization_id", org)
      .eq("memory_scope", OUTCOME_PATTERN_SCOPE)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("subject,metadata,updated_at")
      .eq("organization_id", org)
      .eq("memory_scope", CAPABILITY_COVERAGE_SCOPE)
      .eq("active", true)
      .order("subject", { ascending: true })
      .range(0, 999),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("subject,metadata,updated_at")
      .eq("organization_id", org)
      .eq("memory_scope", CAPABILITY_COVERAGE_SCOPE)
      .eq("active", true)
      .order("subject", { ascending: true })
      .range(1000, 1999),
  ]);
  if (result.error) throw result.error;
  if (patternResult.error) throw patternResult.error;
  if (coverageResultA.error) throw coverageResultA.error;
  if (coverageResultB.error) throw coverageResultB.error;
  const coverageRows = [...list(coverageResultA.data), ...list(coverageResultB.data)];
  const derived = deriveAvantiqoMeasuredCalibrationPolicy(result.data);
  const outcomeCautions = list(patternResult.data).map((row) => {
    const metadata = object(row.metadata);
    return {
      capability_key: text(metadata.capability_key || row.subject, 300),
      pattern_class: text(metadata.pattern_class, 120),
      total_verified_outcomes: Number(metadata.total_verified_outcomes || 0),
      verified_failure_count: Number(metadata.verified_failure_count || 0),
      smoothed_success_rate: bounded(metadata.smoothed_success_rate, 0),
    };
  }).filter((item) => item.capability_key && item.pattern_class === "REPEATED_FAILURE_RISK").slice(0, 20);

  const capabilityProfiles = coverageRows.map((row) => {
    const metadata = object(row.metadata);
    const intelligenceCoverage = bounded(metadata.intelligence_coverage_score, 0);
    const readinessStatus = text(metadata.capability_readiness_status, 80) || "UNKNOWN";
    const readinessScore = readinessStatus === "MEASURED" ? bounded(metadata.capability_readiness_score, 0) : null;
    const verifiedFailureCount = Number(metadata.verified_failure_count || 0);
    const profileClass = verifiedFailureCount > 0
      ? "VERIFIED_OUTCOME_RISK"
      : readinessStatus !== "MEASURED"
        ? "READINESS_UNKNOWN"
        : readinessScore !== null && readinessScore < 0.7
          ? "READINESS_FRICTION"
          : intelligenceCoverage < 0.55
            ? "INTELLIGENCE_COVERAGE_WEAK"
            : "EVIDENCE_STABLE";
    return {
      capability_key: text(metadata.capability_key || row.subject, 300),
      profile_class: profileClass,
      intelligence_coverage_score: intelligenceCoverage,
      readiness_status: readinessStatus,
      readiness_score: readinessScore,
      verified_failure_count: verifiedFailureCount,
      live_verified_outcome_count: Number(metadata.live_verified_outcome_count || 0),
      weighted_verified_outcome_units: Number(metadata.weighted_verified_outcome_units || 0),
      authority_effect: "NONE",
    };
  }).filter((item) => item.capability_key);
  const capabilityCautions = capabilityProfiles
    .filter((item) => item.profile_class !== "EVIDENCE_STABLE")
    .sort((a,b) => a.intelligence_coverage_score - b.intelligence_coverage_score || a.capability_key.localeCompare(b.capability_key))
    .slice(0, 100);
  return {
    ...derived,
    verified_outcome_cautions: outcomeCautions,
    capability_profiles: capabilityProfiles,
    capability_cautions: capabilityCautions,
    policy: {
      ...derived.policy,
      require_independent_verification_for_outcome_cautions: outcomeCautions.length > 0,
      capability_profile_routing_only: true,
      capability_profile_authority_effect: "NONE",
    },
  };
}

export function measuredCalibrationPolicyMessage(policy) {
  const value = object(policy);
  if (value.available !== true) return null;
  return {
    role: "assistant",
    content: [
      "AVANTIQO_MEASURED_CALIBRATION_POLICY_V1",
      "This is measured routing/critique guidance only. It is never business evidence and never authorization.",
      "Repeated measured weaknesses may increase critique or require cheaper authoritative evidence first. They cannot lower safety, grant write authority, waive confirmation/approval, or trigger external spend.",
      JSON.stringify(value),
    ].join("\n"),
  };
}

export const AvantiqoMeasuredCalibrationPolicyRuntime = Object.freeze({
  contract: AVANTIQO_MEASURED_CALIBRATION_POLICY_CONTRACT,
  derive: deriveAvantiqoMeasuredCalibrationPolicy,
  load: loadAvantiqoMeasuredCalibrationPolicy,
  message: measuredCalibrationPolicyMessage,
});
