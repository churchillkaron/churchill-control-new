import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  buildAvantiqoInternalProductKnowledgeUnits,
} from "@/lib/intelligence/runtime/AvantiqoInternalProductKnowledgeRuntime";

export const AVANTIQO_LEARNING_COVERAGE_CONTRACT =
  "AVANTIQO_LEARNING_COVERAGE_V1";

const MEMORY_TABLE = "intelligence_memories";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const AGENDA_SCOPE = "platform_learning_agenda";
const GAP_SCOPE = "platform_learning_gaps";
const TRAINING_SCOPE = "platform_training_candidates";
const RUN_SCOPE = "platform_learning_runs";
const INTERNAL_SOURCE = "avantiqo_canonical_product_knowledge";
const DEFAULT_MAX_NEW_AGENDA_ITEMS = 10;
const MAX_NEW_AGENDA_ITEMS = 40;
const MAX_EXTERNAL_AGE_DAYS = 365;
const MIN_EXACT_CLAIMS = 2;
const MIN_SOURCE_COUNT = 2;
const MIN_CONFIDENCE = 0.78;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundedScore(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function hashKey(prefix, value) {
  return `${prefix}:${createHash("sha256")
    .update(text(value, 20000).toLowerCase())
    .digest("hex")
    .slice(0, 40)}`;
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function dateAgeDays(value, nowMs = Date.now()) {
  const parsed = Date.parse(text(value, 120));
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - parsed) / DAY_MS);
}

function unique(values) {
  return [...new Set(values.map((value) => text(value, 2000)).filter(Boolean))];
}

function sourceUrls(row = {}) {
  return unique(
    list(object(row.metadata).sources)
      .map((source) => object(source).url)
      .filter((url) => /^https?:\/\//i.test(text(url, 2000))),
  );
}

function isMutableDomain(domain) {
  return new Set([
    "integrations",
    "intelligence",
    "compliance",
    "administration",
    "services",
  ]).has(text(domain, 120).toLowerCase());
}

function workspaceUnits() {
  return buildAvantiqoInternalProductKnowledgeUnits()
    .filter((entry) => entry?.object_type === "registry_workspace")
    .filter((entry) => {
      const status = text(entry?.metadata?.status, 80).toLowerCase();
      return !status || status === "active" || status === "planned";
    })
    .map((entry) => {
      const status = text(entry?.metadata?.status, 80).toLowerCase() || "active";
      const domain = text(entry?.domain, 120) || "platform";
      const workspaceId = text(entry?.metadata?.workspace_id, 180) ||
        text(entry?.reference?.split(":").at(-1), 180);
      const workspaceName = text(entry?.metadata?.workspace_name, 300) ||
        text(entry?.subject, 300) || workspaceId;
      const topicKey = `product-coverage-${createHash("sha256")
        .update(text(entry.reference, 2000).toLowerCase())
        .digest("hex")
        .slice(0, 20)}`;
      return {
        reference: text(entry.reference, 2000),
        subject: text(entry.subject, 500),
        domain,
        workspace_id: workspaceId,
        workspace_name: workspaceName,
        status,
        topic_key: topicKey,
        internal_fingerprint: text(entry.fingerprint, 128),
        metadata: object(entry.metadata),
      };
    });
}

function learningQuery(workspace) {
  return [
    `For the enterprise software capability ${workspace.workspace_name} in the ${workspace.domain} domain, identify the canonical business objects, required fields and information, lifecycle states, operator actions, validations, permissions, exception handling, approvals, audit evidence, reports, document previews and integration behaviors that a world-class implementation should support.`,
    "Separate durable product patterns from jurisdiction-specific requirements.",
    "Prefer authoritative standards, government or regulator guidance where relevant, and primary documentation from established enterprise systems or standards bodies.",
    "Focus on reusable product knowledge rather than customer-specific implementation details.",
  ].join(" ");
}

function evidenceFreshnessDays(workspace) {
  return isMutableDomain(workspace.domain) ? 60 : 180;
}

function reviewIntervalDays(workspace) {
  return isMutableDomain(workspace.domain) ? 45 : 150;
}

function candidateMatchesWorkspace(row, workspace) {
  const metadata = object(row.metadata);
  const capability = text(metadata.capability_key || row.subject, 400).toLowerCase();
  const workspaceId = text(workspace.workspace_id, 180).toLowerCase();
  const domain = text(workspace.domain, 120).toLowerCase();
  if (!capability) return false;
  return Boolean(
    (workspaceId && capability.includes(workspaceId)) ||
    (domain && capability.startsWith(`${domain}.`)) ||
    (domain && capability.startsWith(`${domain}:`)),
  );
}

function knowledgeMatchesExactTopic(row, workspace) {
  const metadata = object(row.metadata);
  return text(metadata.topic_key, 200) === workspace.topic_key;
}

function knowledgeMatchesDomain(row, workspace) {
  const metadata = object(row.metadata);
  return text(metadata.knowledge_domain, 120).toLowerCase() ===
    text(workspace.domain, 120).toLowerCase();
}

function validExternalKnowledge(row, nowMs) {
  if (row?.active !== true || row?.source === INTERNAL_SOURCE) return false;
  if (row?.forgotten_at || row?.superseded_at || row?.superseded_by) return false;
  if (row?.valid_until) {
    const expires = Date.parse(row.valid_until);
    if (Number.isFinite(expires) && expires <= nowMs) return false;
  }
  return boundedScore(row?.confidence) >= 0.6;
}

function coverageForWorkspace({
  workspace,
  knowledge,
  agendas,
  trainingCandidates,
  learningRuns,
  nowMs,
}) {
  const allExternal = knowledge.filter((row) => validExternalKnowledge(row, nowMs));
  const exactAll = allExternal.filter((row) => knowledgeMatchesExactTopic(row, workspace));
  const domainAll = allExternal.filter((row) => knowledgeMatchesDomain(row, workspace));
  const maxAge = evidenceFreshnessDays(workspace);
  const exactFresh = exactAll.filter((row) => {
    const metadata = object(row.metadata);
    const verifiedAt = metadata.verified_at || row.updated_at || row.created_at;
    return dateAgeDays(verifiedAt, nowMs) <= maxAge;
  });
  const domainFresh = domainAll.filter((row) => {
    const metadata = object(row.metadata);
    const verifiedAt = metadata.verified_at || row.updated_at || row.created_at;
    return dateAgeDays(verifiedAt, nowMs) <= Math.min(MAX_EXTERNAL_AGE_DAYS, maxAge * 2);
  });
  const exactSources = unique(exactFresh.flatMap(sourceUrls));
  const domainSources = unique(domainFresh.flatMap(sourceUrls));
  const exactConfidence = exactFresh.length
    ? exactFresh.reduce((sum, row) => sum + boundedScore(row.confidence), 0) / exactFresh.length
    : 0;
  const domainConfidence = domainFresh.length
    ? domainFresh.reduce((sum, row) => sum + boundedScore(row.confidence), 0) / domainFresh.length
    : 0;
  const exactCoverage = Math.min(1, exactFresh.length / 3) * 0.55;
  const domainCoverage = Math.min(1, domainFresh.length / 8) * 0.12;
  const sourceCoverage = Math.min(1, exactSources.length / 4) * 0.15;
  const confidenceCoverage = Math.min(1, exactConfidence / 0.95) * 0.12;
  const fallbackConfidence = exactFresh.length ? 0 : Math.min(1, domainConfidence / 0.95) * 0.03;
  const coverageScore = boundedScore(
    exactCoverage + domainCoverage + sourceCoverage + confidenceCoverage + fallbackConfidence,
  );

  const agenda = agendas.find((row) =>
    text(object(row.metadata).topic_key, 200) === workspace.topic_key && row?.active === true,
  ) || null;
  const candidateSignals = trainingCandidates.filter((row) =>
    row?.active === true && candidateMatchesWorkspace(row, workspace),
  );
  const runSignals = learningRuns.filter((row) => text(row?.subject, 200) === workspace.topic_key);
  const recentErrors = runSignals.filter((row) =>
    text(object(row.metadata).status, 80).toUpperCase() === "ERROR",
  ).length;
  const exactStaleCount = Math.max(0, exactAll.length - exactFresh.length);

  const reasons = [];
  if (exactFresh.length < MIN_EXACT_CLAIMS) reasons.push("INSUFFICIENT_EXACT_VERIFIED_CLAIMS");
  if (exactSources.length < MIN_SOURCE_COUNT) reasons.push("INSUFFICIENT_EXACT_SOURCE_DIVERSITY");
  if (exactFresh.length && exactConfidence < MIN_CONFIDENCE) reasons.push("EXACT_CONFIDENCE_BELOW_TARGET");
  if (exactStaleCount > 0 && exactFresh.length < MIN_EXACT_CLAIMS) reasons.push("EXACT_KNOWLEDGE_STALE");
  if (candidateSignals.length > 0) reasons.push("VERIFIED_RUNTIME_LEARNING_SIGNAL_PRESENT");
  if (recentErrors > 0) reasons.push("PRIOR_RESEARCH_FAILURE_PRESENT");

  const basePriority = workspace.status === "active" ? 0.7 : 0.46;
  const gapBoost = (1 - coverageScore) * 0.2;
  const runtimeBoost = Math.min(0.06, candidateSignals.length * 0.02);
  const researchFailureBoost = Math.min(0.04, recentErrors * 0.01);
  const staleBoost = exactStaleCount > 0 ? 0.04 : 0;
  const priority = boundedScore(
    basePriority + gapBoost + runtimeBoost + researchFailureBoost + staleBoost,
  );

  return {
    workspace,
    coverage_score: Number(coverageScore.toFixed(4)),
    priority: Number(priority.toFixed(4)),
    needs_learning: reasons.length > 0,
    reasons,
    exact_claim_count: exactFresh.length,
    exact_stale_count: exactStaleCount,
    exact_source_count: exactSources.length,
    domain_claim_count: domainFresh.length,
    domain_source_count: domainSources.length,
    average_exact_confidence: Number(exactConfidence.toFixed(4)),
    runtime_training_signal_count: candidateSignals.length,
    recent_research_error_count: recentErrors,
    agenda_exists: Boolean(agenda),
    agenda_status: agenda ? text(object(agenda.metadata).status, 80) || null : null,
  };
}

async function loadLearningState(organizationId) {
  const [knowledge, agendas, trainingCandidates, learningRuns, gaps] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,content,confidence,importance,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", KNOWLEDGE_SCOPE)
      .eq("active", true)
      .limit(5000),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,importance,active,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", AGENDA_SCOPE)
      .eq("active", true)
      .limit(5000),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,active,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", TRAINING_SCOPE)
      .eq("active", true)
      .limit(2000),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,active,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", RUN_SCOPE)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,active,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", GAP_SCOPE)
      .limit(5000),
  ]);
  for (const result of [knowledge, agendas, trainingCandidates, learningRuns, gaps]) {
    if (result.error) throw result.error;
  }
  return {
    knowledge: list(knowledge.data),
    agendas: list(agendas.data),
    trainingCandidates: list(trainingCandidates.data),
    learningRuns: list(learningRuns.data),
    gaps: list(gaps.data),
  };
}

function gapMemoryKey(workspace) {
  return hashKey("learning-gap", workspace.reference);
}

function gapRow({ organizationId, coverage, nowIso }) {
  const workspace = coverage.workspace;
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: GAP_SCOPE,
    memory_key: gapMemoryKey(workspace),
    memory_type: "goal",
    subject: `Learning coverage: ${workspace.domain}.${workspace.workspace_id}`,
    content: coverage.needs_learning
      ? `Verified reusable knowledge coverage for ${workspace.workspace_name} is incomplete and should be improved.`
      : `Verified reusable knowledge coverage for ${workspace.workspace_name} currently meets the Learning coverage target.`,
    importance: coverage.priority,
    confidence: 1,
    source: "avantiqo_learning_coverage_director",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_LEARNING_COVERAGE_CONTRACT,
      topic_key: workspace.topic_key,
      workspace_reference: workspace.reference,
      workspace_id: workspace.workspace_id,
      workspace_name: workspace.workspace_name,
      workspace_status: workspace.status,
      knowledge_domain: workspace.domain,
      internal_product_fingerprint: workspace.internal_fingerprint,
      coverage_score: coverage.coverage_score,
      priority: coverage.priority,
      needs_learning: coverage.needs_learning,
      reasons: coverage.reasons,
      exact_claim_count: coverage.exact_claim_count,
      exact_stale_count: coverage.exact_stale_count,
      exact_source_count: coverage.exact_source_count,
      domain_claim_count: coverage.domain_claim_count,
      domain_source_count: coverage.domain_source_count,
      average_exact_confidence: coverage.average_exact_confidence,
      runtime_training_signal_count: coverage.runtime_training_signal_count,
      recent_research_error_count: coverage.recent_research_error_count,
      agenda_exists: coverage.agenda_exists,
      agenda_status: coverage.agenda_status,
      generated_at: nowIso,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
    },
    updated_at: nowIso,
  };
}

function agendaRow({ organizationId, coverage, nowIso }) {
  const workspace = coverage.workspace;
  const mutable = isMutableDomain(workspace.domain);
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AGENDA_SCOPE,
    memory_key: hashKey("coverage-agenda", workspace.topic_key),
    memory_type: "goal",
    subject: workspace.topic_key,
    content: learningQuery(workspace),
    importance: coverage.priority,
    confidence: 1,
    source: "learning_coverage_director",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      continuous_learning: true,
      self_directed_learning: true,
      coverage_directed: true,
      topic_key: workspace.topic_key,
      knowledge_domain: workspace.domain,
      jurisdiction: null,
      stability: mutable ? "mutable" : "stable",
      freshness_days: evidenceFreshnessDays(workspace),
      review_interval_days: reviewIntervalDays(workspace),
      preferred_domains: [],
      status: "READY",
      next_research_at: nowIso,
      failure_count: 0,
      lease_token: null,
      lease_expires_at: null,
      parent_topic_key: null,
      created_by: "learning_coverage_director",
      coverage_gap_memory_key: gapMemoryKey(workspace),
      workspace_reference: workspace.reference,
      workspace_id: workspace.workspace_id,
      workspace_status: workspace.status,
      initial_coverage_score: coverage.coverage_score,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
    },
    updated_at: nowIso,
  };
}

async function persistCoverage({ organizationId, coverage, previousGaps, maxNewAgendaItems }) {
  const nowIso = new Date().toISOString();
  const gapRows = coverage.map((entry) => gapRow({ organizationId, coverage: entry, nowIso }));
  let gapWriteCount = 0;
  for (let index = 0; index < gapRows.length; index += 150) {
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .upsert(gapRows.slice(index, index + 150), {
        onConflict: "organization_id,memory_scope,memory_key",
      })
      .select("id");
    if (result.error) throw result.error;
    gapWriteCount += list(result.data).length;
  }

  const desiredGapKeys = new Set(gapRows.map((row) => row.memory_key));
  const retiredGapIds = previousGaps
    .filter((row) => row.active === true && !desiredGapKeys.has(text(row.memory_key, 160)))
    .map((row) => row.id)
    .filter(Boolean);
  let retiredGapCount = 0;
  if (retiredGapIds.length) {
    const retiredAt = new Date().toISOString();
    const retired = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({ active: false, superseded_at: retiredAt, updated_at: retiredAt })
      .eq("organization_id", organizationId)
      .eq("memory_scope", GAP_SCOPE)
      .in("id", retiredGapIds)
      .select("id");
    if (retired.error) throw retired.error;
    retiredGapCount = list(retired.data).length;
  }

  const selected = coverage
    .filter((entry) => entry.needs_learning && !entry.agenda_exists)
    .sort((left, right) => right.priority - left.priority || left.workspace.reference.localeCompare(right.workspace.reference))
    .slice(0, maxNewAgendaItems);
  let agendaWriteCount = 0;
  if (selected.length) {
    const agendaRows = selected.map((entry) => agendaRow({
      organizationId,
      coverage: entry,
      nowIso,
    }));
    const written = await supabaseAdmin
      .from(MEMORY_TABLE)
      .upsert(agendaRows, {
        onConflict: "organization_id,memory_scope,memory_key",
        ignoreDuplicates: true,
      })
      .select("id");
    if (written.error) throw written.error;
    agendaWriteCount = list(written.data).length;
  }

  return {
    gap_write_count: gapWriteCount,
    retired_gap_count: retiredGapCount,
    agenda_write_count: agendaWriteCount,
    seeded_topic_keys: selected.map((entry) => entry.workspace.topic_key),
  };
}

export async function reconcileAvantiqoLearningCoverage({
  organizationId = null,
  maxNewAgendaItems = null,
  persist = true,
} = {}) {
  const organization = text(organizationId, 160) || learningOrganizationId();
  if (!organization) {
    return {
      success: true,
      contract: AVANTIQO_LEARNING_COVERAGE_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      workspace_count: 0,
      learning_gap_count: 0,
      agenda_seeded_count: 0,
    };
  }

  const maximum = boundedInteger(
    maxNewAgendaItems ?? process.env.AVANTIQO_LEARNING_COVERAGE_MAX_NEW_AGENDA_ITEMS,
    DEFAULT_MAX_NEW_AGENDA_ITEMS,
    0,
    MAX_NEW_AGENDA_ITEMS,
  );
  const workspaces = workspaceUnits();
  const state = await loadLearningState(organization);
  const nowMs = Date.now();
  const coverage = workspaces.map((workspace) => coverageForWorkspace({
    workspace,
    knowledge: state.knowledge,
    agendas: state.agendas,
    trainingCandidates: state.trainingCandidates,
    learningRuns: state.learningRuns,
    nowMs,
  }));
  const gaps = coverage.filter((entry) => entry.needs_learning);
  const active = coverage.filter((entry) => entry.workspace.status === "active");
  const activeGaps = gaps.filter((entry) => entry.workspace.status === "active");
  const averageCoverage = coverage.length
    ? coverage.reduce((sum, entry) => sum + entry.coverage_score, 0) / coverage.length
    : 0;
  const persistence = persist
    ? await persistCoverage({
        organizationId: organization,
        coverage,
        previousGaps: state.gaps,
        maxNewAgendaItems: maximum,
      })
    : {
        gap_write_count: 0,
        retired_gap_count: 0,
        agenda_write_count: 0,
        seeded_topic_keys: [],
      };

  return {
    success: true,
    contract: AVANTIQO_LEARNING_COVERAGE_CONTRACT,
    status: gaps.length ? "LEARNING_GAPS_IDENTIFIED" : "COVERAGE_TARGET_MET",
    workspace_count: coverage.length,
    active_workspace_count: active.length,
    learning_gap_count: gaps.length,
    active_learning_gap_count: activeGaps.length,
    average_coverage_score: Number(averageCoverage.toFixed(4)),
    agenda_seeded_count: persistence.agenda_write_count,
    gap_write_count: persistence.gap_write_count,
    retired_gap_count: persistence.retired_gap_count,
    highest_priority_gaps: gaps
      .slice()
      .sort((left, right) => right.priority - left.priority)
      .slice(0, 12)
      .map((entry) => ({
        topic_key: entry.workspace.topic_key,
        domain: entry.workspace.domain,
        workspace_id: entry.workspace.workspace_id,
        workspace_name: entry.workspace.workspace_name,
        workspace_status: entry.workspace.status,
        priority: entry.priority,
        coverage_score: entry.coverage_score,
        reasons: entry.reasons,
        exact_claim_count: entry.exact_claim_count,
        exact_source_count: entry.exact_source_count,
        runtime_training_signal_count: entry.runtime_training_signal_count,
        agenda_exists: entry.agenda_exists,
      })),
    governance: {
      self_directed_curriculum: true,
      canonical_product_registry_driven: true,
      verified_public_evidence_required: true,
      runtime_failure_signals_influence_priority: true,
      research_execution_remains_bounded_by_continuous_learning_budget: true,
      customer_private_memory_promoted: false,
      customer_private_content_allowed: false,
      raw_reasoning_persisted: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      gpu_execution_performed: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoLearningCoverageRuntime = Object.freeze({
  contract: AVANTIQO_LEARNING_COVERAGE_CONTRACT,
  reconcile: reconcileAvantiqoLearningCoverage,
});
