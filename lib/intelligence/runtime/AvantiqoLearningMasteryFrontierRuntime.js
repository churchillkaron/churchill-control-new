import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  summarizeAvantiqoVerifiedExecutionOutcomes,
} from "@/lib/intelligence/runtime/AvantiqoVerifiedOutcomeLearningRuntime";

export const AVANTIQO_LEARNING_MASTERY_FRONTIER_CONTRACT =
  "AVANTIQO_LEARNING_MASTERY_FRONTIER_V1";

const MEMORY_TABLE = "intelligence_memories";
const GAP_SCOPE = "platform_learning_gaps";
const AGENDA_SCOPE = "platform_learning_agenda";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const CURRICULUM_SCOPE = "platform_learning_curriculum_nodes";
const DEPENDENCY_IMPACT_SCOPE = "platform_learning_knowledge_dependency_impacts";
const COMPETENCY_SCOPE = "platform_learning_competency_mastery";
const FRONTIER_SCOPE = "platform_learning_frontier_priorities";
const INTERNAL_SOURCE = "avantiqo_canonical_product_knowledge";
const RELEASE_SOURCE = "avantiqo_explicit_final_knowledge_release";
const MAX_TOPICS = 1500;
const MAX_FRONTIER_ITEMS = 12;
const MAX_FRONTIER_PER_DOMAIN = 3;
const MAX_AGENDA_ADJUSTMENT = 0.12;
const MIN_FRONTIER_SCORE = 0.32;
const MIN_OPERATIONAL_VALIDATION_OUTCOMES = 8;
const MIN_STABLE_MASTERY_OUTCOMES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bounded(value, fallback = 0, minimum = 0, maximum = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function topicKey(row) {
  const metadata = object(row?.metadata);
  return text(metadata.topic_key || metadata.parent_topic_key || row?.subject, 240);
}

function domainKey(row) {
  return text(object(row?.metadata).knowledge_domain, 120).toLowerCase() || "platform";
}

function workspaceId(row) {
  return text(object(row?.metadata).workspace_id, 180).toLowerCase() || null;
}

function dateAgeDays(value, nowMs = Date.now()) {
  const parsed = Date.parse(text(value, 120));
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - parsed) / DAY_MS);
}

function validUntil(row, nowMs = Date.now()) {
  const parsed = Date.parse(text(row?.valid_until, 120));
  return !Number.isFinite(parsed) || parsed > nowMs;
}

function exactKnowledgeForTopic(knowledge, key) {
  return knowledge.filter((row) => {
    const metadata = object(row.metadata);
    return (
      topicKey(row) === key &&
      row.source !== INTERNAL_SOURCE &&
      row.active === true &&
      !row.superseded_at &&
      !row.superseded_by &&
      !row.forgotten_at &&
      validUntil(row) &&
      metadata.reusable_platform_knowledge !== false &&
      metadata.knowledge_router_reuse_allowed !== false
    );
  });
}

function releasedRowsForTopic(knowledge, key) {
  return knowledge.filter((row) =>
    topicKey(row) === key && row.source === RELEASE_SOURCE,
  );
}

function hardHoldForTopic(knowledge, key) {
  return releasedRowsForTopic(knowledge, key).some((row) => {
    const metadata = object(row.metadata);
    const status = text(metadata.release_status || metadata.lifecycle_status, 120).toUpperCase();
    return (
      metadata.dependency_hold === true ||
      status === "DEPENDENCY_HOLD" ||
      status.includes("QUARANTINED") ||
      status.includes("RETIRED_EXPIRED")
    );
  });
}

function dependencyImpactForTopic(impacts, knowledge, key) {
  const topicFingerprints = new Set(
    releasedRowsForTopic(knowledge, key)
      .map((row) => text(object(row.metadata).hypothesis_fingerprint, 128))
      .filter(Boolean),
  );
  if (!topicFingerprints.size) return 0;
  return impacts.filter((row) => {
    const metadata = object(row.metadata);
    return (
      row.active === true &&
      text(metadata.status, 120) === "DEPENDENCY_HOLD_REVALIDATION_REQUIRED" &&
      topicFingerprints.has(text(metadata.dependent_hypothesis_fingerprint, 128))
    );
  }).length;
}

function sourceCountForKnowledge(rows) {
  const urls = new Set();
  for (const row of rows) {
    for (const source of list(object(row.metadata).sources)) {
      const url = text(object(source).url, 2000);
      if (/^https?:\/\//i.test(url)) urls.add(url);
    }
  }
  return urls.size;
}

function newestKnowledgeAgeDays(rows, nowMs) {
  if (!rows.length) return null;
  return Math.min(...rows.map((row) => {
    const metadata = object(row.metadata);
    return dateAgeDays(metadata.verified_at || metadata.released_at || row.updated_at || row.created_at, nowMs);
  }));
}

function outcomeForTopic(topic, summaries) {
  const domain = topic.domain;
  const workspace = topic.workspace_id;
  const relevant = list(summaries).filter((summary) => {
    const capability = text(summary?.capability_key, 300).toLowerCase();
    const capabilityDomain = text(summary?.capability_domain, 120).toLowerCase();
    if (workspace && capability.includes(workspace)) return true;
    return Boolean(domain && capabilityDomain === domain);
  });
  const successCount = relevant.reduce(
    (sum, item) => sum + Math.max(0, Number(item?.verified_success_count || 0)),
    0,
  );
  const failureCount = relevant.reduce(
    (sum, item) => sum + Math.max(0, Number(item?.verified_failure_count || 0)),
    0,
  );
  const total = successCount + failureCount;
  const smoothedSuccess = total ? (successCount + 2) / (total + 4) : null;
  const unstableCount = relevant.filter((item) =>
    list(item?.signals).includes("PRODUCT_OUTCOME_UNSTABLE") ||
    list(item?.signals).includes("REPEATED_VERIFIED_FAILURES"),
  ).length;
  return {
    observational_only: true,
    causal_attribution_allowed: false,
    matched_capability_count: relevant.length,
    total_verified_outcomes: total,
    verified_success_count: successCount,
    verified_failure_count: failureCount,
    smoothed_success_rate: smoothedSuccess === null
      ? null
      : Number(smoothedSuccess.toFixed(4)),
    unstable_capability_count: unstableCount,
  };
}

function agendaEffectiveness(agenda) {
  const effectiveness = object(object(agenda?.metadata).learning_effectiveness);
  return {
    effectiveness_score: bounded(effectiveness.effectiveness_score, 0.45),
    evidence_yield_score: bounded(effectiveness.evidence_yield_score, 0.4),
    reliability_score: bounded(effectiveness.reliability_score, 0.45),
    recent_run_count: Math.max(0, Number(effectiveness.recent_run_count || 0)),
    failure_rate: effectiveness.failure_rate === null || effectiveness.failure_rate === undefined
      ? null
      : bounded(effectiveness.failure_rate, 0),
    zero_yield_rate: effectiveness.zero_yield_rate === null || effectiveness.zero_yield_rate === undefined
      ? null
      : bounded(effectiveness.zero_yield_rate, 0),
    signals: list(effectiveness.signals).map((signal) => text(signal, 160)).filter(Boolean),
  };
}

function candidateTopics(state) {
  const byKey = new Map();
  function absorb(row, source) {
    const key = topicKey(row);
    if (!key) return;
    const metadata = object(row.metadata);
    const existing = byKey.get(key) || {
      key,
      domain: domainKey(row),
      workspace_id: workspaceId(row),
      gap: null,
      agenda: null,
      curriculum: [],
      sources: new Set(),
    };
    if (source === "gap") existing.gap = row;
    if (source === "agenda") existing.agenda = row;
    if (source === "curriculum") existing.curriculum.push(row);
    if (existing.domain === "platform" && metadata.knowledge_domain) {
      existing.domain = domainKey(row);
    }
    if (!existing.workspace_id && workspaceId(row)) existing.workspace_id = workspaceId(row);
    existing.sources.add(source);
    byKey.set(key, existing);
  }

  state.gaps.forEach((row) => absorb(row, "gap"));
  state.agendas.forEach((row) => absorb(row, "agenda"));
  state.curriculum
    .filter((row) => text(object(row.metadata).node_type, 80) === "TOPIC")
    .forEach((row) => absorb(row, "curriculum"));

  return [...byKey.values()]
    .sort((left, right) => {
      const leftImportance = Number(left.gap?.importance || left.agenda?.importance || 0);
      const rightImportance = Number(right.gap?.importance || right.agenda?.importance || 0);
      return rightImportance - leftImportance;
    })
    .slice(0, MAX_TOPICS);
}

function masteryAssessment({ topic, state, outcomeSummaries, nowMs }) {
  const gapMetadata = object(topic.gap?.metadata);
  const coverage = bounded(gapMetadata.coverage_score, 0);
  const exactClaimCount = Math.max(0, Number(gapMetadata.exact_claim_count || 0));
  const exactSourceCount = Math.max(0, Number(gapMetadata.exact_source_count || 0));
  const averageExactConfidence = bounded(gapMetadata.average_exact_confidence, 0);
  const runtimeSignalCount = Math.max(0, Number(gapMetadata.runtime_training_signal_count || 0));
  const gapReasons = list(gapMetadata.reasons).map((reason) => text(reason, 160)).filter(Boolean);
  const effectiveness = agendaEffectiveness(topic.agenda);
  const knowledge = exactKnowledgeForTopic(state.knowledge, topic.key);
  const knowledgeSourceCount = sourceCountForKnowledge(knowledge);
  const newestAgeDays = newestKnowledgeAgeDays(knowledge, nowMs);
  const averageKnowledgeConfidence = knowledge.length
    ? knowledge.reduce((sum, row) => sum + bounded(row.confidence, 0), 0) / knowledge.length
    : 0;
  const dependencyImpactCount = dependencyImpactForTopic(
    state.dependencyImpacts,
    state.knowledge,
    topic.key,
  );
  const hardHold = hardHoldForTopic(state.knowledge, topic.key) || dependencyImpactCount > 0;
  const outcome = outcomeForTopic(topic, outcomeSummaries);

  const sourceDiversity = bounded(Math.max(exactSourceCount, knowledgeSourceCount) / 4, 0);
  const evidenceConfidence = Math.max(averageExactConfidence, averageKnowledgeConfidence);
  const freshness = newestAgeDays === null
    ? 0
    : bounded(1 - newestAgeDays / 365, 0);
  const operationalValidation = outcome.total_verified_outcomes
    ? bounded(
        ((outcome.smoothed_success_rate || 0) * 0.75) +
          Math.min(1, outcome.total_verified_outcomes / MIN_STABLE_MASTERY_OUTCOMES) * 0.25,
        0,
      )
    : 0;

  const masteryScore = bounded(
    coverage * 0.31 +
      effectiveness.effectiveness_score * 0.19 +
      sourceDiversity * 0.12 +
      evidenceConfidence * 0.12 +
      freshness * 0.08 +
      operationalValidation * 0.18,
    0,
  );

  const strongEvidence = Boolean(
    coverage >= 0.78 &&
      exactClaimCount >= 2 &&
      Math.max(exactSourceCount, knowledgeSourceCount) >= 2 &&
      evidenceConfidence >= 0.78 &&
      knowledge.length > 0
  );
  const operationallyValidated = Boolean(
    strongEvidence &&
      outcome.total_verified_outcomes >= MIN_OPERATIONAL_VALIDATION_OUTCOMES &&
      (outcome.smoothed_success_rate || 0) >= 0.9 &&
      outcome.unstable_capability_count === 0 &&
      runtimeSignalCount === 0
  );
  const stableMastery = Boolean(
    operationallyValidated &&
      coverage >= 0.85 &&
      effectiveness.effectiveness_score >= 0.82 &&
      masteryScore >= 0.86 &&
      outcome.total_verified_outcomes >= MIN_STABLE_MASTERY_OUTCOMES &&
      (outcome.smoothed_success_rate || 0) >= 0.95 &&
      newestAgeDays !== null &&
      newestAgeDays <= 180
  );

  let stateName = "DISCOVERY";
  if (hardHold) stateName = "MASTERY_HELD";
  else if (coverage < 0.35 || exactClaimCount === 0) stateName = "DISCOVERY";
  else if (coverage < 0.65 || masteryScore < 0.58) stateName = "DEVELOPING";
  else if (!strongEvidence) stateName = "VALIDATING_EVIDENCE";
  else if (!operationallyValidated) stateName = "EVIDENCE_STRONG_OPERATIONAL_VALIDATION_REQUIRED";
  else if (!stableMastery) stateName = "OPERATIONALLY_VALIDATED";
  else stateName = "STABLE_MASTERY_MONITORED";

  const operationalRisk = bounded(
    Math.min(1, runtimeSignalCount / 3) * 0.45 +
      Math.min(1, outcome.unstable_capability_count) * 0.4 +
      (outcome.total_verified_outcomes >= 3 && (outcome.smoothed_success_rate || 1) < 0.8 ? 0.15 : 0),
    0,
  );
  const dependencyRisk = hardHold ? 1 : bounded(dependencyImpactCount / 2, 0);
  const knowledgeGap = 1 - coverage;
  const effectivenessGap = 1 - effectiveness.effectiveness_score;
  const novelty = effectiveness.recent_run_count === 0
    ? 0.9
    : bounded(1 - Math.min(10, effectiveness.recent_run_count) / 10, 0.15, 0.9);
  const stagnation = effectiveness.recent_run_count >= 4 && coverage < 0.65
    ? bounded(
        0.55 +
          (effectiveness.zero_yield_rate || 0) * 0.25 +
          (effectiveness.failure_rate || 0) * 0.2,
        0,
      )
    : 0;
  const stalePenalty = gapReasons.includes("EXACT_KNOWLEDGE_STALE") ? 0.18 : 0;
  const masteryPenalty = stableMastery ? 0.24 : operationallyValidated ? 0.1 : 0;
  const frontierScore = bounded(
    knowledgeGap * 0.27 +
      effectivenessGap * 0.14 +
      operationalRisk * 0.2 +
      dependencyRisk * 0.16 +
      novelty * 0.1 +
      stagnation * 0.09 +
      stalePenalty -
      masteryPenalty,
    0,
  );

  const frontierReasons = [];
  if (knowledgeGap >= 0.45) frontierReasons.push("VERIFIED_COVERAGE_GAP");
  if (effectivenessGap >= 0.45) frontierReasons.push("LEARNING_EFFECTIVENESS_GAP");
  if (operationalRisk > 0) frontierReasons.push("VERIFIED_OPERATIONAL_RISK");
  if (dependencyRisk > 0) frontierReasons.push("VERIFIED_DEPENDENCY_RISK");
  if (stagnation > 0) frontierReasons.push("REPEATED_RESEARCH_STAGNATION");
  if (novelty >= 0.8) frontierReasons.push("UNDEREXPLORED_TOPIC");
  if (gapReasons.includes("EXACT_KNOWLEDGE_STALE")) frontierReasons.push("STALE_KNOWLEDGE");
  if (stableMastery) frontierReasons.push("STABLE_MASTERY_DEPRIORITIZE");

  return {
    topic,
    state: stateName,
    mastery_score: Number(masteryScore.toFixed(4)),
    coverage_score: Number(coverage.toFixed(4)),
    effectiveness_score: Number(effectiveness.effectiveness_score.toFixed(4)),
    evidence_yield_score: Number(effectiveness.evidence_yield_score.toFixed(4)),
    reliability_score: Number(effectiveness.reliability_score.toFixed(4)),
    exact_claim_count: exactClaimCount,
    exact_source_count: exactSourceCount,
    reusable_knowledge_count: knowledge.length,
    reusable_source_count: knowledgeSourceCount,
    average_evidence_confidence: Number(evidenceConfidence.toFixed(4)),
    newest_knowledge_age_days: newestAgeDays === null ? null : Number(newestAgeDays.toFixed(2)),
    runtime_signal_count: runtimeSignalCount,
    dependency_impact_count: dependencyImpactCount,
    hard_dependency_or_quarantine_hold: hardHold,
    verified_outcome: outcome,
    strong_evidence: strongEvidence,
    operationally_validated: operationallyValidated,
    stable_mastery: stableMastery,
    frontier_score: Number(frontierScore.toFixed(4)),
    frontier_reasons: frontierReasons,
    stagnation_score: Number(stagnation.toFixed(4)),
    novelty_score: Number(novelty.toFixed(4)),
    operational_risk_score: Number(operationalRisk.toFixed(4)),
    dependency_risk_score: Number(dependencyRisk.toFixed(4)),
    mastery_is_permanent: false,
    model_self_confidence_used_as_mastery_evidence: false,
    research_productivity_alone_can_establish_mastery: false,
    observational_success_alone_can_establish_mastery: false,
  };
}

function selectFrontier(assessments) {
  const selected = [];
  const perDomain = new Map();
  const ordered = assessments
    .filter((item) => item.frontier_score >= MIN_FRONTIER_SCORE)
    .sort((left, right) => {
      const holdDelta = Number(right.hard_dependency_or_quarantine_hold) -
        Number(left.hard_dependency_or_quarantine_hold);
      if (holdDelta !== 0) return holdDelta;
      const riskDelta = right.operational_risk_score - left.operational_risk_score;
      if (riskDelta !== 0) return riskDelta;
      return right.frontier_score - left.frontier_score;
    });

  for (const item of ordered) {
    if (selected.length >= MAX_FRONTIER_ITEMS) break;
    const domain = item.topic.domain || "platform";
    const count = perDomain.get(domain) || 0;
    if (count >= MAX_FRONTIER_PER_DOMAIN) continue;
    selected.push({ ...item, frontier_rank: selected.length + 1 });
    perDomain.set(domain, count + 1);
  }
  return selected;
}

function competencyRow(organizationId, assessment, nowIso) {
  const key = assessment.topic.key;
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: COMPETENCY_SCOPE,
    memory_key: `competency:${digest(key).slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Learning competency: ${key}`,
    content: `Evidence-backed Learning competency state: ${assessment.state}.`,
    importance: bounded(0.55 + assessment.frontier_score * 0.35, 0.7),
    confidence: 1,
    source: "avantiqo_learning_mastery_frontier",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_LEARNING_MASTERY_FRONTIER_CONTRACT,
      topic_key: key,
      knowledge_domain: assessment.topic.domain,
      workspace_id: assessment.topic.workspace_id,
      competency_state: assessment.state,
      mastery_score: assessment.mastery_score,
      coverage_score: assessment.coverage_score,
      effectiveness_score: assessment.effectiveness_score,
      evidence_yield_score: assessment.evidence_yield_score,
      reliability_score: assessment.reliability_score,
      exact_claim_count: assessment.exact_claim_count,
      exact_source_count: assessment.exact_source_count,
      reusable_knowledge_count: assessment.reusable_knowledge_count,
      reusable_source_count: assessment.reusable_source_count,
      average_evidence_confidence: assessment.average_evidence_confidence,
      newest_knowledge_age_days: assessment.newest_knowledge_age_days,
      runtime_signal_count: assessment.runtime_signal_count,
      dependency_impact_count: assessment.dependency_impact_count,
      hard_dependency_or_quarantine_hold: assessment.hard_dependency_or_quarantine_hold,
      verified_outcome: assessment.verified_outcome,
      strong_evidence: assessment.strong_evidence,
      operationally_validated: assessment.operationally_validated,
      stable_mastery: assessment.stable_mastery,
      frontier_score: assessment.frontier_score,
      frontier_reasons: assessment.frontier_reasons,
      stagnation_score: assessment.stagnation_score,
      novelty_score: assessment.novelty_score,
      operational_risk_score: assessment.operational_risk_score,
      dependency_risk_score: assessment.dependency_risk_score,
      mastery_is_permanent: false,
      mastery_requires_current_evidence: true,
      mastery_requires_operational_validation: true,
      model_self_confidence_used_as_mastery_evidence: false,
      research_productivity_alone_can_establish_mastery: false,
      observational_success_alone_can_establish_mastery: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      customer_private_content_included: false,
      source_customer_identifiers_persisted: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      evaluated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function frontierRow(organizationId, assessment, nowIso) {
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: FRONTIER_SCOPE,
    memory_key: `frontier:${digest(assessment.topic.key).slice(0, 40)}`,
    memory_type: "goal",
    subject: `Learning frontier: ${assessment.topic.key}`,
    content: `Learning frontier priority ${assessment.frontier_rank}: ${assessment.frontier_reasons.join(", ") || "bounded exploration"}.`,
    importance: bounded(0.65 + assessment.frontier_score * 0.32, 0.8),
    confidence: 1,
    source: "avantiqo_learning_mastery_frontier",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_LEARNING_MASTERY_FRONTIER_CONTRACT,
      topic_key: assessment.topic.key,
      knowledge_domain: assessment.topic.domain,
      workspace_id: assessment.topic.workspace_id,
      frontier_rank: assessment.frontier_rank,
      frontier_score: assessment.frontier_score,
      frontier_reasons: assessment.frontier_reasons,
      competency_state: assessment.state,
      mastery_score: assessment.mastery_score,
      portfolio_domain_cap: MAX_FRONTIER_PER_DOMAIN,
      maximum_frontier_items: MAX_FRONTIER_ITEMS,
      bounded_portfolio_selection: true,
      semantic_similarity_used_for_selection: false,
      model_self_interest_used_for_selection: false,
      automatic_provider_execution: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      selected_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function loadState(organizationId) {
  const [gaps, agendas, knowledge, curriculum, dependencyImpacts, existingFrontier] =
    await Promise.all([
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("id,memory_key,subject,content,importance,active,metadata,updated_at,created_at")
        .eq("organization_id", organizationId)
        .eq("memory_scope", GAP_SCOPE)
        .eq("active", true)
        .limit(5000),
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("id,memory_key,subject,content,importance,active,metadata,updated_at,created_at")
        .eq("organization_id", organizationId)
        .eq("memory_scope", AGENDA_SCOPE)
        .eq("active", true)
        .limit(5000),
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("id,memory_key,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
        .eq("organization_id", organizationId)
        .eq("memory_scope", KNOWLEDGE_SCOPE)
        .limit(5000),
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("id,memory_key,subject,content,importance,active,metadata,updated_at,created_at")
        .eq("organization_id", organizationId)
        .eq("memory_scope", CURRICULUM_SCOPE)
        .eq("active", true)
        .limit(5000),
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("id,memory_key,subject,content,importance,active,metadata,updated_at,created_at")
        .eq("organization_id", organizationId)
        .eq("memory_scope", DEPENDENCY_IMPACT_SCOPE)
        .eq("active", true)
        .limit(4000),
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("id,memory_key,subject,active,metadata,updated_at")
        .eq("organization_id", organizationId)
        .eq("memory_scope", FRONTIER_SCOPE)
        .eq("active", true)
        .limit(1000),
    ]);
  for (const result of [gaps, agendas, knowledge, curriculum, dependencyImpacts, existingFrontier]) {
    if (result.error) throw result.error;
  }
  return {
    gaps: list(gaps.data),
    agendas: list(agendas.data),
    knowledge: list(knowledge.data),
    curriculum: list(curriculum.data),
    dependencyImpacts: list(dependencyImpacts.data),
    existingFrontier: list(existingFrontier.data),
  };
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  let count = 0;
  for (let index = 0; index < rows.length; index += 150) {
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .upsert(rows.slice(index, index + 150), {
        onConflict: "organization_id,memory_scope,memory_key",
      })
      .select("id");
    if (result.error) throw result.error;
    count += list(result.data).length;
  }
  return count;
}

async function retireOldFrontier(organizationId, existing, selectedKeys, nowIso) {
  const stale = existing.filter((row) => !selectedKeys.has(row.memory_key));
  let retired = 0;
  for (const row of stale) {
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        active: false,
        forgotten_at: nowIso,
        metadata: {
          ...object(row.metadata),
          active_frontier: false,
          retired_at: nowIso,
          retirement_reason: "NO_LONGER_SELECTED_IN_BOUNDED_FRONTIER",
        },
        updated_at: nowIso,
      })
      .eq("organization_id", organizationId)
      .eq("id", row.id)
      .eq("updated_at", row.updated_at)
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (result.data?.id) retired += 1;
  }
  return retired;
}

function frontierAdjustment(assessment, selected) {
  if (assessment.stable_mastery) return -0.05;
  if (!selected) return 0;
  return bounded(
    0.025 + assessment.frontier_score * 0.095,
    0,
    0,
    MAX_AGENDA_ADJUSTMENT,
  );
}

async function applyAgendaFrontier(organizationId, assessments, selected, nowIso) {
  const selectedKeys = new Set(selected.map((item) => item.topic.key));
  let adjusted = 0;
  for (const assessment of assessments) {
    const agenda = assessment.topic.agenda;
    if (!agenda?.id) continue;
    const metadata = object(agenda.metadata);
    const previousAdjustment = bounded(
      metadata.mastery_frontier_adjustment,
      0,
      -MAX_AGENDA_ADJUSTMENT,
      MAX_AGENDA_ADJUSTMENT,
    );
    const currentImportance = bounded(agenda.importance, 0.7);
    const baseImportance = bounded(currentImportance - previousAdjustment, currentImportance);
    const nextAdjustment = frontierAdjustment(assessment, selectedKeys.has(assessment.topic.key));
    const nextImportance = bounded(baseImportance + nextAdjustment, baseImportance);
    const nextMetadata = {
      ...metadata,
      mastery_frontier_contract: AVANTIQO_LEARNING_MASTERY_FRONTIER_CONTRACT,
      mastery_frontier_score: assessment.frontier_score,
      mastery_frontier_selected: selectedKeys.has(assessment.topic.key),
      mastery_frontier_adjustment: Number(nextAdjustment.toFixed(4)),
      mastery_frontier_competency_state: assessment.state,
      mastery_frontier_evaluated_at: nowIso,
      mastery_frontier_priority_is_not_truth_confidence: true,
      mastery_frontier_does_not_bypass_epistemic_pipeline: true,
    };
    const importanceChanged = Math.abs(nextImportance - currentImportance) >= 0.002;
    const metadataChanged =
      metadata.mastery_frontier_score !== assessment.frontier_score ||
      metadata.mastery_frontier_selected !== selectedKeys.has(assessment.topic.key) ||
      previousAdjustment !== nextAdjustment ||
      metadata.mastery_frontier_competency_state !== assessment.state;
    if (!importanceChanged && !metadataChanged) continue;
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        importance: Number(nextImportance.toFixed(4)),
        metadata: nextMetadata,
        updated_at: nowIso,
      })
      .eq("organization_id", organizationId)
      .eq("id", agenda.id)
      .eq("updated_at", agenda.updated_at)
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (result.data?.id) adjusted += 1;
  }
  return adjusted;
}

export async function reconcileAvantiqoLearningMasteryFrontier({ persist = true } = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_LEARNING_MASTERY_FRONTIER_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      evaluated_topic_count: 0,
      frontier_selected_count: 0,
    };
  }

  const [state, verifiedOutcomes] = await Promise.all([
    loadState(organizationId),
    summarizeAvantiqoVerifiedExecutionOutcomes({ lookbackDays: 180 }),
  ]);
  const outcomeSummaries = verifiedOutcomes.available === true
    ? list(verifiedOutcomes.summaries)
    : [];
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const topics = candidateTopics(state);
  const assessments = topics.map((topic) =>
    masteryAssessment({ topic, state, outcomeSummaries, nowMs }),
  );
  const frontier = selectFrontier(assessments);
  const competencyRows = assessments.map((assessment) =>
    competencyRow(organizationId, assessment, nowIso),
  );
  const frontierRows = frontier.map((assessment) =>
    frontierRow(organizationId, assessment, nowIso),
  );
  const selectedMemoryKeys = new Set(frontierRows.map((row) => row.memory_key));

  let competencyWriteCount = 0;
  let frontierWriteCount = 0;
  let frontierRetiredCount = 0;
  let agendaAdjustmentCount = 0;
  if (persist) {
    [competencyWriteCount, frontierWriteCount] = await Promise.all([
      upsertRows(competencyRows),
      upsertRows(frontierRows),
    ]);
    frontierRetiredCount = await retireOldFrontier(
      organizationId,
      state.existingFrontier,
      selectedMemoryKeys,
      nowIso,
    );
    agendaAdjustmentCount = await applyAgendaFrontier(
      organizationId,
      assessments,
      frontier,
      nowIso,
    );
  }

  const states = assessments.reduce((result, assessment) => {
    result[assessment.state] = (result[assessment.state] || 0) + 1;
    return result;
  }, {});
  const stableMasteryCount = assessments.filter((item) => item.stable_mastery).length;
  const heldCount = assessments.filter((item) => item.hard_dependency_or_quarantine_hold).length;
  const stagnatingCount = assessments.filter((item) => item.stagnation_score > 0).length;

  return {
    success: true,
    contract: AVANTIQO_LEARNING_MASTERY_FRONTIER_CONTRACT,
    status: heldCount
      ? "MASTERY_RISK_REQUIRES_RELEARNING"
      : frontier.length
        ? "LEARNING_FRONTIER_PRIORITIZED"
        : "LEARNING_PORTFOLIO_STABLE",
    evaluated_topic_count: assessments.length,
    competency_state_counts: states,
    stable_mastery_count: stableMasteryCount,
    held_mastery_count: heldCount,
    stagnating_topic_count: stagnatingCount,
    frontier_selected_count: frontier.length,
    frontier_maximum_items: MAX_FRONTIER_ITEMS,
    frontier_maximum_per_domain: MAX_FRONTIER_PER_DOMAIN,
    competency_write_count: competencyWriteCount,
    frontier_write_count: frontierWriteCount,
    frontier_retired_count: frontierRetiredCount,
    agenda_priority_adjustment_count: agendaAdjustmentCount,
    frontier: frontier.map((item) => ({
      rank: item.frontier_rank,
      topic_key: item.topic.key,
      knowledge_domain: item.topic.domain,
      competency_state: item.state,
      mastery_score: item.mastery_score,
      frontier_score: item.frontier_score,
      reasons: item.frontier_reasons,
    })),
    mastery_policy: {
      states: [
        "DISCOVERY",
        "DEVELOPING",
        "VALIDATING_EVIDENCE",
        "EVIDENCE_STRONG_OPERATIONAL_VALIDATION_REQUIRED",
        "OPERATIONALLY_VALIDATED",
        "STABLE_MASTERY_MONITORED",
        "MASTERY_HELD",
      ],
      stable_mastery_requires_current_reusable_evidence: true,
      stable_mastery_requires_source_diversity: true,
      stable_mastery_requires_operational_validation: true,
      stable_mastery_minimum_verified_outcomes: MIN_STABLE_MASTERY_OUTCOMES,
      stable_mastery_minimum_smoothed_success_rate: 0.95,
      mastery_is_permanent: false,
      model_self_confidence_used_as_mastery_evidence: false,
      research_productivity_alone_can_establish_mastery: false,
      observational_success_alone_can_establish_mastery: false,
      dependency_or_quarantine_hold_blocks_mastery: true,
    },
    frontier_policy: {
      bounded_portfolio_selection: true,
      domain_diversity_cap: MAX_FRONTIER_PER_DOMAIN,
      coverage_gap_considered: true,
      learning_effectiveness_gap_considered: true,
      verified_operational_risk_considered: true,
      verified_dependency_risk_considered: true,
      underexplored_topics_considered: true,
      repeated_research_stagnation_considered: true,
      stable_mastery_deprioritized: true,
      priority_adjustment_is_idempotent: true,
      priority_is_not_truth_confidence: true,
      semantic_similarity_used_for_selection: false,
      model_self_interest_used_for_selection: false,
      epistemic_pipeline_bypassed: false,
    },
    governance: {
      provider_free: true,
      web_research_executed_here: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      platform_knowledge_written: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      customer_private_content_promoted: false,
      source_customer_identifiers_persisted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoLearningMasteryFrontierRuntime = Object.freeze({
  contract: AVANTIQO_LEARNING_MASTERY_FRONTIER_CONTRACT,
  reconcile: reconcileAvantiqoLearningMasteryFrontier,
});
