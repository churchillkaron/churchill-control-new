import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  inferOperatorResearchMode,
  operatorResearchRequirements,
} from "@/lib/platform/research/runtime/OperatorMechanismResearchPolicy";
import {
  createAvantiqoLearningMechanismAgendaAuthenticityVerifier,
  isAvantiqoEvidenceCandidateMechanismAgenda,
} from "./AvantiqoLearningMechanismAgendaAuthenticityRuntime.js";

export const AVANTIQO_MECHANISM_FIRST_LEARNING_CONTRACT =
  "AVANTIQO_MECHANISM_FIRST_LEARNING_V1";

const MEMORY_TABLE = "intelligence_memories";
const AGENDA_SCOPE = "platform_learning_agenda";
const GAP_SCOPE = "platform_learning_gaps";
const RUN_SCOPE = "platform_learning_runs";
const PROGRAM_SCOPE = "platform_learning_discovery_programs";
const DEFAULT_MAX_PROGRAMS = 8;
const MAX_PROGRAMS = 30;
const DEFAULT_MAX_NEW_AGENDA_ITEMS = 12;
const MAX_NEW_AGENDA_ITEMS = 40;

const DISCOVERY_PHASES = Object.freeze([
  "UNDERSTAND_PROBLEM",
  "MAP_MECHANISMS",
  "IDENTIFY_CONSTRAINTS",
  "RESEARCH_ADJACENT_FIELDS",
  "FORM_FALSIFIABLE_HYPOTHESES",
  "DESIGN_DISCRIMINATING_EXPERIMENTS",
  "EXECUTE_GOVERNED_EXPERIMENTS",
  "LEARN_FROM_RESULTS",
  "INVENT_ALTERNATIVES",
  "VERIFY_AND_REPEAT",
]);

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

function learningScopeId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function hash(prefix, ...parts) {
  const digest = createHash("sha256")
    .update(parts.map((part) => text(part, 12000).toLowerCase()).join("|"))
    .digest("hex")
    .slice(0, 40);
  return `${prefix}:${digest}`;
}

function topicKey(row) {
  return text(object(row?.metadata).topic_key || row?.subject, 240);
}

function researchRunStatus(row) {
  const metadata = object(row?.metadata);
  return text(metadata.status, 80).toUpperCase();
}

function completedProductiveRun(row) {
  const metadata = object(row?.metadata);
  return (
    researchRunStatus(row) === "COMPLETED" &&
    Number(metadata.claim_count || 0) > 0 &&
    Number(metadata.source_count || 0) > 0
  );
}

function learningSignals(metadata = {}) {
  const effectiveness = object(metadata.learning_effectiveness);
  const utility = object(metadata.knowledge_utility_feedback);
  return new Set([
    ...list(effectiveness.signals),
    ...list(utility.signals),
  ].map((value) => text(value, 160)).filter(Boolean));
}

function inferLearningMode(agenda, gap, runs) {
  const metadata = object(agenda.metadata);
  const explicit = text(metadata.research_mode, 40).toLowerCase();
  const base = inferOperatorResearchMode({
    query: agenda.content,
    objective: `Self-directed learning for ${topicKey(agenda)}`,
    research_mode: ["evidence", "mechanism", "invention"].includes(explicit)
      ? explicit
      : null,
  });
  const signals = learningSignals(metadata);
  const gapMetadata = object(gap?.metadata);
  const coverage = bounded(gapMetadata.coverage_score, 0);
  const failures = runs.filter((row) => researchRunStatus(row) === "ERROR").length;
  const zeroYield = runs.filter((row) => {
    const item = object(row.metadata);
    return researchRunStatus(row) === "COMPLETED" && Number(item.claim_count || 0) === 0;
  }).length;
  const productive = runs.filter(completedProductiveRun).length;
  const runtimeSignals = Math.max(0, Number(gapMetadata.runtime_training_signal_count || 0));

  const inventionEscalation = Boolean(
    failures >= 3 ||
    zeroYield >= 3 ||
    signals.has("REPEATED_ZERO_YIELD_RESEARCH") ||
    signals.has("HIGH_RESEARCH_FAILURE_RATE") ||
    signals.has("KNOWLEDGE_UTILITY_NEGATIVE_ASSOCIATION") ||
    (runtimeSignals >= 2 && productive >= 2 && coverage < 0.7)
  );
  if (inventionEscalation) return "invention";

  const mechanismEscalation = Boolean(
    base !== "evidence" ||
    failures >= 1 ||
    zeroYield >= 1 ||
    runtimeSignals > 0 ||
    coverage < 0.55 ||
    signals.has("VERIFIED_PRODUCT_OUTCOME_ATTENTION_REQUIRED") ||
    signals.has("VERIFIED_PRODUCT_CAPABILITY_UNSTABLE")
  );
  return mechanismEscalation ? "mechanism" : "evidence";
}

function trackKey(rootKey, kind) {
  return `discovery-${kind}-${createHash("sha256")
    .update(`${rootKey}|${kind}`.toLowerCase())
    .digest("hex")
    .slice(0, 20)}`;
}

function discoveryTracks({ rootKey, domain, query, mode }) {
  const tracks = [];
  if (mode === "evidence") return tracks;

  tracks.push({
    kind: "mechanisms",
    key: trackKey(rootKey, "mechanisms"),
    query: [
      `Understand the underlying mechanisms for this problem: ${query}`,
      "Explain causal mechanisms, invariants, interfaces, state transitions, bottlenecks, failure modes, measurable variables and tradeoffs.",
      "Existing implementations are evidence about mechanisms, not the boundary of possible solutions.",
      "Prefer primary research, standards, technical papers and authoritative engineering documentation.",
    ].join(" "),
  });
  tracks.push({
    kind: "constraints",
    key: trackKey(rootKey, "constraints"),
    query: [
      `Identify what actually constrains this objective: ${query}`,
      "Separate mathematical or physical constraints from policy/law, external dependencies, resource constraints, architecture limits, implementation failures and simple knowledge gaps.",
      "A failed approach is evidence against that approach, not evidence that the objective is impossible.",
      "Find measurable tests that could distinguish fundamental constraints from changeable constraints.",
    ].join(" "),
  });

  if (mode === "invention") {
    tracks.push({
      kind: "adjacent-fields",
      key: trackKey(rootKey, "adjacent-fields"),
      query: [
        `Research adjacent scientific and engineering fields that may contain transferable mechanisms for this objective: ${query}`,
        "Look beyond the current software category and beyond GitHub implementations.",
        "Identify mechanisms from other disciplines, why they may transfer, where the analogy breaks, and what evidence would test the transfer.",
      ].join(" "),
    });
    tracks.push({
      kind: "alternative-architectures",
      key: trackKey(rootKey, "alternative-architectures"),
      query: [
        `Find materially different mechanism-level approaches to this objective: ${query}`,
        "Do not optimize only the current architecture.",
        "Compare different primitives, decompositions, representations, protocols, algorithms or system boundaries and identify the constraints each one changes.",
      ].join(" "),
    });
    tracks.push({
      kind: "experiment-evidence",
      key: trackKey(rootKey, "experiment-evidence"),
      query: [
        `Find experimental methods and measurable benchmarks relevant to this objective: ${query}`,
        "Prioritize experiments that can falsify hypotheses or discriminate between competing mechanisms rather than demonstrations that merely confirm one favored approach.",
      ].join(" "),
    });
  }

  return tracks.map((track) => ({ ...track, domain }));
}

function agendaChildRow({ organizationId, root, track, nowIso }) {
  const metadata = object(root.metadata);
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AGENDA_SCOPE,
    memory_key: hash("mechanism-agenda", topicKey(root), track.kind),
    memory_type: "goal",
    subject: track.key,
    content: track.query,
    importance: Math.max(0.5, bounded(root.importance, 0.7) - 0.04),
    confidence: 1,
    source: "mechanism_first_learning_director",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      continuous_learning: true,
      self_directed_learning: true,
      mechanism_first_learning: true,
      topic_key: track.key,
      parent_topic_key: topicKey(root),
      discovery_track_kind: track.kind,
      knowledge_domain: track.domain || metadata.knowledge_domain || null,
      jurisdiction: metadata.jurisdiction || null,
      stability: metadata.stability || "stable",
      freshness_days: boundedInteger(metadata.freshness_days, 180, 1, 3650),
      review_interval_days: boundedInteger(metadata.review_interval_days, 120, 1, 3650),
      preferred_domains: list(metadata.preferred_domains).slice(0, 10),
      research_mode: "evidence",
      status: "READY",
      next_research_at: nowIso,
      failure_count: 0,
      lease_token: null,
      lease_expires_at: null,
      created_by: "mechanism_first_learning_director",
      implementation_reference_is_evidence_not_answer: true,
      failed_approach_does_not_prove_objective_impossible: true,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
    },
    updated_at: nowIso,
  };
}

function programRow({ organizationId, agenda, gap, mode, tracks, runs, allRuns, nowIso }) {
  const rootKey = topicKey(agenda);
  const metadata = object(agenda.metadata);
  const requirements = operatorResearchRequirements(mode);
  const runByTopic = new Map();
  for (const row of allRuns) {
    const key = topicKey(row);
    const bucket = runByTopic.get(key) || [];
    bucket.push(row);
    runByTopic.set(key, bucket);
  }
  const trackState = tracks.map((track) => {
    const evidenceRuns = runByTopic.get(track.key) || [];
    const productive = evidenceRuns.filter(completedProductiveRun);
    return {
      kind: track.kind,
      topic_key: track.key,
      productive_run_count: productive.length,
      evidence_ready: productive.length > 0,
    };
  });
  const evidenceReady = trackState.length > 0 && trackState.every((item) => item.evidence_ready);
  const status = mode === "evidence"
    ? "EVIDENCE_LEARNING_ONLY"
    : evidenceReady
      ? "READY_FOR_MODAL_SYNTHESIS"
      : "COLLECTING_MECHANISM_EVIDENCE";

  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: PROGRAM_SCOPE,
    memory_key: hash("discovery-program", rootKey),
    memory_type: "goal",
    subject: rootKey,
    content: `Mechanism-first self-learning program for ${rootKey}.`,
    importance: bounded(agenda.importance, 0.7),
    confidence: 1,
    source: "mechanism_first_learning_director",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_MECHANISM_FIRST_LEARNING_CONTRACT,
      root_topic_key: rootKey,
      knowledge_domain: metadata.knowledge_domain || null,
      research_mode: mode,
      status,
      discovery_phases: DISCOVERY_PHASES,
      requirements,
      track_state: trackState,
      evidence_ready_for_synthesis: evidenceReady,
      root_recent_run_count: runs.length,
      root_failure_count: runs.filter((row) => researchRunStatus(row) === "ERROR").length,
      root_zero_yield_count: runs.filter((row) => {
        const item = object(row.metadata);
        return researchRunStatus(row) === "COMPLETED" && Number(item.claim_count || 0) === 0;
      }).length,
      coverage_score: bounded(object(gap?.metadata).coverage_score, 0),
      synthesis_executor: "AVANTIQO_OWNED_INTELLIGENCE",
      synthesis_execution_lane: "deep",
      synthesis_runtime_contract: "AVANTIQO_INTELLIGENCE_MODAL_H100_V1",
      synthesis_modal_only: mode !== "evidence",
      synthesis_spend_approval_required: mode !== "evidence",
      synthesis_requested: false,
      automatic_gpu_execution: false,
      automatic_non_modal_submission: false,
      automatic_experiment_execution: false,
      automatic_model_weight_mutation: false,
      implementation_reference_is_evidence_not_answer: true,
      failed_approach_does_not_prove_objective_impossible: true,
      hypotheses_must_be_falsifiable: mode !== "evidence",
      experiments_should_discriminate_between_hypotheses: mode !== "evidence",
      adjacent_domain_transfer_required: mode === "invention",
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      updated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function loadState(organizationId) {
  const [agendas, gaps, runs, programs] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,importance,active,metadata,updated_at,created_at,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_type,confidence,source,valid_until,superseded_by,superseded_at,forgotten_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", AGENDA_SCOPE)
      .eq("active", true)
      .limit(5000),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,active,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", GAP_SCOPE)
      .eq("active", true)
      .limit(5000),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,metadata,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", RUN_SCOPE)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,active,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", PROGRAM_SCOPE)
      .eq("active", true)
      .limit(5000),
  ]);
  for (const result of [agendas, gaps, runs, programs]) {
    if (result.error) throw result.error;
  }
  return {
    agendas: list(agendas.data),
    gaps: list(gaps.data),
    runs: list(runs.data),
    programs: list(programs.data),
  };
}

export async function reconcileAvantiqoMechanismFirstLearning({
  maxPrograms = DEFAULT_MAX_PROGRAMS,
  maxNewAgendaItems = DEFAULT_MAX_NEW_AGENDA_ITEMS,
  persist = true,
} = {}) {
  const organizationId = learningScopeId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_MECHANISM_FIRST_LEARNING_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      program_count: 0,
      new_research_track_count: 0,
    };
  }

  const state = await loadState(organizationId);
  const mechanismAgendaVerifier =
    createAvantiqoLearningMechanismAgendaAuthenticityVerifier();
  let evidenceMechanismAgendaCount = 0;
  let authenticatedEvidenceMechanismAgendaCount = 0;
  let rejectedUnauthenticatedEvidenceMechanismAgendaCount = 0;
  const admissibleAgendas = state.agendas.filter((row) => {
    if (!isAvantiqoEvidenceCandidateMechanismAgenda(row)) return true;
    evidenceMechanismAgendaCount += 1;
    const verified = mechanismAgendaVerifier.available === true &&
      mechanismAgendaVerifier.verify(row);
    if (verified) authenticatedEvidenceMechanismAgendaCount += 1;
    else rejectedUnauthenticatedEvidenceMechanismAgendaCount += 1;
    return verified;
  });

  const programLimit = boundedInteger(maxPrograms, DEFAULT_MAX_PROGRAMS, 1, MAX_PROGRAMS);
  const agendaLimit = boundedInteger(
    maxNewAgendaItems,
    DEFAULT_MAX_NEW_AGENDA_ITEMS,
    0,
    MAX_NEW_AGENDA_ITEMS,
  );
  const gapByTopic = new Map(state.gaps.map((row) => [topicKey(row), row]));
  const runsByTopic = new Map();
  for (const row of state.runs) {
    const key = topicKey(row);
    const bucket = runsByTopic.get(key) || [];
    bucket.push(row);
    runsByTopic.set(key, bucket);
  }
  const existingAgendaKeys = new Set(state.agendas.map(topicKey));

  const roots = admissibleAgendas
    .filter((row) => object(row.metadata).mechanism_first_learning !== true)
    .map((agenda) => {
      const key = topicKey(agenda);
      const gap = gapByTopic.get(key) || null;
      const runs = runsByTopic.get(key) || [];
      const mode = inferLearningMode(agenda, gap, runs);
      const tracks = discoveryTracks({
        rootKey: key,
        domain: text(object(agenda.metadata).knowledge_domain, 120) || null,
        query: text(agenda.content, 4000),
        mode,
      });
      return { agenda, gap, runs, mode, tracks };
    })
    .filter((item) => item.mode !== "evidence" || Boolean(item.gap))
    .sort((a, b) => bounded(b.agenda.importance, 0) - bounded(a.agenda.importance, 0))
    .slice(0, programLimit);

  const nowIso = new Date().toISOString();
  const childRows = [];
  const programRows = [];
  for (const item of roots) {
    for (const track of item.tracks) {
      if (existingAgendaKeys.has(track.key)) continue;
      childRows.push(agendaChildRow({
        organizationId,
        root: item.agenda,
        track,
        nowIso,
      }));
    }
    programRows.push(programRow({
      organizationId,
      agenda: item.agenda,
      gap: item.gap,
      mode: item.mode,
      tracks: item.tracks,
      runs: item.runs,
      allRuns: state.runs,
      nowIso,
    }));
  }

  let newResearchTracks = 0;
  let programWrites = 0;
  if (persist) {
    const selectedChildren = childRows.slice(0, agendaLimit);
    if (selectedChildren.length) {
      const result = await supabaseAdmin
        .from(MEMORY_TABLE)
        .upsert(selectedChildren, {
          onConflict: "organization_id,memory_scope,memory_key",
          ignoreDuplicates: true,
        })
        .select("id");
      if (result.error) throw result.error;
      newResearchTracks = list(result.data).length;
    }
    if (programRows.length) {
      const result = await supabaseAdmin
        .from(MEMORY_TABLE)
        .upsert(programRows, {
          onConflict: "organization_id,memory_scope,memory_key",
        })
        .select("id");
      if (result.error) throw result.error;
      programWrites = list(result.data).length;
    }
  }

  const synthesisReady = programRows.filter((row) =>
    object(row.metadata).status === "READY_FOR_MODAL_SYNTHESIS",
  );

  return {
    success: true,
    contract: AVANTIQO_MECHANISM_FIRST_LEARNING_CONTRACT,
    status: synthesisReady.length
      ? "MODAL_SYNTHESIS_READY"
      : roots.length
        ? "MECHANISM_DISCOVERY_ACTIVE"
        : "NO_DISCOVERY_ESCALATION_REQUIRED",
    root_topic_count: roots.length,
    program_count: programRows.length,
    program_write_count: programWrites,
    new_research_track_count: newResearchTracks,
    safe_lease_synthesis_ready_count: synthesisReady.length,
    evidence_candidate_mechanism_agenda_count: evidenceMechanismAgendaCount,
    authenticated_evidence_candidate_mechanism_agenda_count:
      authenticatedEvidenceMechanismAgendaCount,
    rejected_unauthenticated_evidence_candidate_mechanism_agenda_count:
      rejectedUnauthenticatedEvidenceMechanismAgendaCount,
    mechanism_agenda_authenticity_available:
      mechanismAgendaVerifier.available === true,
    modes: {
      evidence: roots.filter((item) => item.mode === "evidence").length,
      mechanism: roots.filter((item) => item.mode === "mechanism").length,
      invention: roots.filter((item) => item.mode === "invention").length,
    },
    highest_priority_programs: programRows.slice(0, 10).map((row) => ({
      topic_key: row.subject,
      research_mode: object(row.metadata).research_mode,
      status: object(row.metadata).status,
      coverage_score: object(row.metadata).coverage_score,
      synthesis_safe_lease_required: object(row.metadata).synthesis_safe_lease_required === true,
    })),
    principles: {
      search_is_evidence_collection_not_problem_solving: true,
      understand_problem_before_solution_search: true,
      mechanism_before_imitation: true,
      identify_real_constraints: true,
      failed_approach_does_not_prove_impossibility: true,
      adjacent_science_and_engineering_research: true,
      falsifiable_hypotheses: true,
      discriminating_experiments: true,
      invent_test_learn_repeat: true,
    },
    governance: {
      hourly_director_provider_free: true,
      evidence_candidate_mechanism_agenda_authenticity_required: true,
      forged_evidence_candidate_mechanism_agenda_rejected: true,
      database_only_writer_cannot_activate_forged_evidence_mechanism_agenda_root: true,
      ordinary_internal_learning_agendas_remain_supported: true,
      hypothesis_synthesis_requires_safe_lease_v2: true,
      synthesis_lane: "intelligence-deep",
      automatic_gpu_execution: false,
      automatic_non_modal_submission: false,
      automatic_experiment_execution: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoMechanismFirstLearningRuntime = Object.freeze({
  contract: AVANTIQO_MECHANISM_FIRST_LEARNING_CONTRACT,
  phases: DISCOVERY_PHASES,
  reconcile: reconcileAvantiqoMechanismFirstLearning,
});
