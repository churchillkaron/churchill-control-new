export const CREATIVE_TEMPORAL_TASTE_MEMORY_CONTRACT = "CREATIVE_TEMPORAL_TASTE_MEMORY_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value, max = 320) {
  const out = String(value ?? "").trim();
  return out ? out.slice(0, max) : null;
}

function compactDecision(item = {}) {
  return {
    decision: text(item.decision, 32),
    scope: text(item.scope, 80),
    subject_type: text(item.subject_type, 100),
    reason_code: text(item.reason_code, 120),
    feedback: text(item.feedback, 320),
    decided_at: item.decided_at || null,
  };
}

export function buildTemporalTasteMemory({ learning = {} } = {}) {
  const human = list(learning.human_decisions).map(compactDecision);
  const rejected = human.filter((item) => item.decision === "REJECTED");
  const approved = human.filter((item) => item.decision === "APPROVED");
  const structural = learning.structural_preference_learning || {};
  const production = learning.production_learning || {};
  const productionEvidence = production.evidence || {};
  const rejectionFrequency = productionEvidence.rejection_reason_frequency || {};
  const recurringRejections = Object.entries(rejectionFrequency)
    .map(([reason, count]) => ({ reason, count: Number(count) || 0 }))
    .filter((entry) => entry.count >= 2)
    .sort((left, right) => right.count - left.count)
    .slice(0, 20);
  const acceptedRejectedPairs = list(productionEvidence.accepted_rejected_pairs)
    .slice(0, 20)
    .map((pair) => ({
      shot_id: text(pair.shot_id, 100),
      accepted_quality: Number.isFinite(Number(pair.accepted_quality)) ? Number(pair.accepted_quality) : null,
      rejected_quality: Number.isFinite(Number(pair.rejected_quality)) ? Number(pair.rejected_quality) : null,
      rejection_reasons: list(pair.rejection_reasons).map((reason) => text(reason, 180)).filter(Boolean),
      dimension_scores: pair.dimension_scores || {},
      accepted_craft_profile: pair.accepted_craft_profile || {},
      rejected_craft_profile: pair.rejected_craft_profile || {},
    }));

  const domainLearning = {};
  for (const pair of acceptedRejectedPairs) {
    for (const [domain, evidence] of Object.entries(pair.dimension_scores || {})) {
      const delta = Number(evidence?.delta);
      if (!Number.isFinite(delta)) continue;
      const bucket = domainLearning[domain] || { pair_count: 0, positive_delta_count: 0, average_delta: 0, strongest_delta: null };
      bucket.pair_count += 1;
      if (delta > 0) bucket.positive_delta_count += 1;
      bucket.average_delta += delta;
      if (bucket.strongest_delta === null || Math.abs(delta) > Math.abs(bucket.strongest_delta)) bucket.strongest_delta = delta;
      domainLearning[domain] = bucket;
    }
  }
  for (const bucket of Object.values(domainLearning)) {
    if (bucket.pair_count) bucket.average_delta = Number((bucket.average_delta / bucket.pair_count).toFixed(3));
  }

  const craftLessons = [];
  for (const pair of acceptedRejectedPairs) {
    for (const domain of ["camera", "performance", "environment", "artifacts", "continuity", "physics", "music_energy"]) {
      const evidence = pair.dimension_scores?.[domain];
      const delta = Number(evidence?.delta);
      if (!Number.isFinite(delta) || delta < 5) continue;
      craftLessons.push({
        domain,
        shot_id: pair.shot_id,
        score_delta: delta,
        accepted: pair.accepted_craft_profile || {},
        rejected: pair.rejected_craft_profile || {},
        reasons: pair.rejection_reasons,
        evidence_only: true,
        copy_forbidden: true,
      });
    }
  }

  return Object.freeze({
    contract: CREATIVE_TEMPORAL_TASTE_MEMORY_CONTRACT,
    status: human.length || Object.keys(structural).length ? "ADVISORY_EVIDENCE_AVAILABLE" : "FRESH_JUDGMENT_REQUIRED",
    recent_rejections: rejected.slice(0, 20),
    recent_approvals: approved.slice(0, 12),
    structural_preferences: structural,
    production_learning: production,
    recurring_rejection_patterns: recurringRejections,
    accepted_rejected_examples: acceptedRejectedPairs,
    domain_learning: domainLearning,
    craft_lessons: craftLessons.slice(0, 24),
    preproduction_learning_gate: {
      repeated_rejection_threshold: 2,
      repeated_patterns_must_be_explicitly_avoided: true,
      accepted_examples_may_inform_quality_but_not_be_copied: true,
      no_prior_failure_pattern_may_be_repeated_without_new_evidence: true,
    },
    interpretation_rules: {
      advisory_only: true,
      never_copy_prior_work: true,
      never_treat_feedback_as_provider_prompt: true,
      fresh_scene_specific_judgment_required: true,
      repeated_rejection_pattern_should_raise_preproduction_gate: true,
      approved_examples_are_quality_evidence_not_style_templates: true,
      quality_floor_may_only_stay_same_or_increase: true,
    },
  });
}

export const CreativeTemporalTasteMemoryRuntime = Object.freeze({
  contract: CREATIVE_TEMPORAL_TASTE_MEMORY_CONTRACT,
  build: buildTemporalTasteMemory,
});
