import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_LEARNING_TRANSFER_CONTRACT =
  "AVANTIQO_LEARNING_TRANSFER_V1";

const MEMORY_TABLE = "intelligence_memories";
const COMPETENCY_SCOPE = "platform_learning_competency_mastery";
const FRONTIER_SCOPE = "platform_learning_frontier_priorities";
const DISCOVERY_SCOPE = "platform_learning_transfer_discoveries";
const HYPOTHESIS_SCOPE = "platform_learning_transfer_hypotheses";
const EXPERIMENT_SCOPE = "platform_learning_transfer_experiment_proposals";
const AGENDA_SCOPE = "platform_learning_agenda";
const MAX_DISCOVERIES = 8;
const MAX_SOURCES_PER_TARGET = 2;
const MAX_EXPERIMENTS_PER_HYPOTHESIS = 3;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueText(values, limit = 20) {
  return [...new Set(
    list(values).map((value) => text(value, 2000)).filter(Boolean),
  )].slice(0, limit);
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function fingerprint(value, code) {
  const normalized = text(value, 160).toLowerCase();
  if (!/^[a-f0-9]{16,128}$/.test(normalized)) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_CONTRACT}_${code}_INVALID`);
  }
  return normalized;
}

function stableMastery(row) {
  const metadata = object(row.metadata);
  return Boolean(
    row.active === true &&
      text(metadata.competency_state, 120) === "STABLE_MASTERY_MONITORED" &&
      metadata.stable_mastery === true &&
      metadata.mastery_is_permanent === false &&
      metadata.model_self_confidence_used_as_mastery_evidence === false &&
      metadata.hard_dependency_or_quarantine_hold !== true &&
      Number(metadata.mastery_score || 0) >= 0.86
  );
}

function activeFrontier(row) {
  const metadata = object(row.metadata);
  return Boolean(
    row.active === true &&
      Number(metadata.frontier_rank || 0) > 0 &&
      Number(metadata.frontier_score || 0) >= 0.32 &&
      metadata.bounded_portfolio_selection === true &&
      metadata.semantic_similarity_used_for_selection === false &&
      metadata.model_self_interest_used_for_selection === false
  );
}

function topicKey(row) {
  return text(object(row.metadata).topic_key || row.subject, 240);
}

function domainKey(row) {
  return text(object(row.metadata).knowledge_domain, 120).toLowerCase() || "platform";
}

function discoveryPairs(masteries, frontiers) {
  const orderedSources = masteries
    .filter(stableMastery)
    .sort((left, right) =>
      Number(object(right.metadata).mastery_score || 0) -
      Number(object(left.metadata).mastery_score || 0),
    );
  const orderedTargets = frontiers
    .filter(activeFrontier)
    .sort((left, right) =>
      Number(object(left.metadata).frontier_rank || 9999) -
      Number(object(right.metadata).frontier_rank || 9999),
    );

  const pairs = [];
  for (const target of orderedTargets) {
    const targetDomain = domainKey(target);
    const usedDomains = new Set();
    for (const source of orderedSources) {
      const sourceDomain = domainKey(source);
      if (!sourceDomain || !targetDomain || sourceDomain === targetDomain) continue;
      if (usedDomains.has(sourceDomain)) continue;
      pairs.push({ source, target });
      usedDomains.add(sourceDomain);
      if (usedDomains.size >= MAX_SOURCES_PER_TARGET || pairs.length >= MAX_DISCOVERIES) break;
    }
    if (pairs.length >= MAX_DISCOVERIES) break;
  }
  return pairs;
}

function discoveryRow(organizationId, pair, nowIso) {
  const sourceTopic = topicKey(pair.source);
  const targetTopic = topicKey(pair.target);
  const sourceDomain = domainKey(pair.source);
  const targetDomain = domainKey(pair.target);
  const discoveryFingerprint = digest(
    "cross-domain-transfer-discovery",
    sourceTopic,
    targetTopic,
    sourceDomain,
    targetDomain,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: DISCOVERY_SCOPE,
    memory_key: `transfer-discovery:${discoveryFingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: `Transfer discovery: ${sourceDomain} -> ${targetDomain}`,
    content: [
      `Investigate whether any mechanism underlying the mastered source topic ${sourceTopic} in ${sourceDomain} can transfer to the frontier target topic ${targetTopic} in ${targetDomain}.`,
      "Decompose mechanisms rather than copying implementations or surface patterns.",
      "Identify invariants, changed constraints, boundary conditions, falsifiers and discriminating experiments.",
      "Treat analogy as a hypothesis only. Topical or semantic similarity is not evidence of transfer.",
      "Do not copy customer-private knowledge, authorization, decisions or identifiers across domains.",
    ].join(" "),
    importance: Math.min(
      0.99,
      0.72 + Number(object(pair.target.metadata).frontier_score || 0) * 0.22,
    ),
    confidence: 1,
    source: "avantiqo_cross_domain_transfer_discovery",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_LEARNING_TRANSFER_CONTRACT,
      status: "TRANSFER_DISCOVERY_REQUESTED",
      discovery_fingerprint: discoveryFingerprint,
      source_topic_key: sourceTopic,
      source_domain: sourceDomain,
      source_competency_state: text(object(pair.source.metadata).competency_state, 120),
      source_mastery_score: Number(object(pair.source.metadata).mastery_score || 0),
      target_topic_key: targetTopic,
      target_domain: targetDomain,
      target_frontier_rank: Number(object(pair.target.metadata).frontier_rank || 0),
      target_frontier_score: Number(object(pair.target.metadata).frontier_score || 0),
      cross_domain_required: true,
      mechanism_mapping_required: true,
      boundary_conditions_required: true,
      falsifiers_required: true,
      discriminating_experiments_required: true,
      analogy_is_hypothesis_not_evidence: true,
      semantic_similarity_is_not_transfer_evidence: true,
      implementation_copy_is_not_transfer_evidence: true,
      automatic_transfer_inference: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      customer_private_content_allowed: false,
      customer_identifiers_allowed: false,
      authorization_value: "none",
      created_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function discoveryAgendaRow(organizationId, pair, nowIso) {
  const discovery = discoveryRow(organizationId, pair, nowIso);
  const key = object(discovery.metadata).discovery_fingerprint;
  return {
    ...discovery,
    memory_scope: AGENDA_SCOPE,
    memory_key: `transfer-agenda:${key.slice(0, 40)}`,
    subject: `transfer-discovery-${key.slice(0, 20)}`,
    source: "avantiqo_cross_domain_transfer_agenda",
    metadata: {
      ...discovery.metadata,
      continuous_learning: true,
      self_directed_learning: true,
      research_mode: "mechanism",
      topic_key: `transfer-${key.slice(0, 20)}`,
      parent_topic_key: object(discovery.metadata).target_topic_key,
      knowledge_domain: object(discovery.metadata).target_domain,
      status: "READY",
      next_research_at: nowIso,
      transfer_discovery_only: true,
      provider_execution_performed_here: false,
    },
  };
}

async function loadState(organizationId) {
  const [mastery, frontier] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,importance,confidence,active,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", COMPETENCY_SCOPE)
      .eq("active", true)
      .limit(2000),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,importance,confidence,active,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", FRONTIER_SCOPE)
      .eq("active", true)
      .limit(500),
  ]);
  if (mastery.error) throw mastery.error;
  if (frontier.error) throw frontier.error;
  return { mastery: list(mastery.data), frontier: list(frontier.data) };
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length;
}

async function loadCompetencyAndFrontier(organizationId, sourceTopic, targetTopic) {
  const [source, target] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,active,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", COMPETENCY_SCOPE)
      .eq("metadata->>topic_key", sourceTopic)
      .eq("active", true)
      .maybeSingle(),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,active,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", FRONTIER_SCOPE)
      .eq("metadata->>topic_key", targetTopic)
      .eq("active", true)
      .maybeSingle(),
  ]);
  if (source.error) throw source.error;
  if (target.error) throw target.error;
  return { source: source.data || null, target: target.data || null };
}

export async function recordAvantiqoVerifiedTransferHypothesis({
  source_topic_key,
  target_topic_key,
  source_domain,
  target_domain,
  mechanism_fingerprint,
  hypothesis_fingerprint,
  evidence_fingerprint,
  verification_method,
  source_contract,
  invariant_mechanisms,
  boundary_conditions,
  falsifiers,
  discriminating_experiments,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const sourceTopic = text(source_topic_key, 240);
  const targetTopic = text(target_topic_key, 240);
  const sourceDomain = text(source_domain, 120).toLowerCase();
  const targetDomain = text(target_domain, 120).toLowerCase();
  const mechanismFingerprint = fingerprint(mechanism_fingerprint, "MECHANISM_FINGERPRINT");
  const hypothesisFingerprint = fingerprint(hypothesis_fingerprint, "HYPOTHESIS_FINGERPRINT");
  const evidenceFingerprint = fingerprint(evidence_fingerprint, "EVIDENCE_FINGERPRINT");
  const verificationMethod = text(verification_method, 240);
  const sourceContract = text(source_contract, 240);
  const invariants = uniqueText(invariant_mechanisms, 12);
  const boundaries = uniqueText(boundary_conditions, 16);
  const falsifierList = uniqueText(falsifiers, 16);
  const experiments = uniqueText(discriminating_experiments, 12);

  if (!sourceTopic || !targetTopic || !sourceDomain || !targetDomain) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_CONTRACT}_SOURCE_TARGET_REQUIRED`);
  }
  if (sourceDomain === targetDomain) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_CONTRACT}_CROSS_DOMAIN_REQUIRED`);
  }
  if (!verificationMethod || !sourceContract) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_CONTRACT}_VERIFICATION_EVIDENCE_REQUIRED`);
  }
  if (invariants.length < 1) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_CONTRACT}_INVARIANT_MECHANISM_REQUIRED`);
  }
  if (boundaries.length < 2) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_CONTRACT}_BOUNDARY_CONDITIONS_INSUFFICIENT`);
  }
  if (falsifierList.length < 2) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_CONTRACT}_FALSIFIERS_INSUFFICIENT`);
  }
  if (experiments.length < 2) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_CONTRACT}_DISCRIMINATING_EXPERIMENTS_INSUFFICIENT`);
  }

  const state = await loadCompetencyAndFrontier(organizationId, sourceTopic, targetTopic);
  if (!state.source || !stableMastery(state.source)) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_CONTRACT}_STABLE_SOURCE_MASTERY_REQUIRED`);
  }
  if (!state.target || !activeFrontier(state.target)) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_CONTRACT}_ACTIVE_TARGET_FRONTIER_REQUIRED`);
  }
  if (domainKey(state.source) !== sourceDomain || domainKey(state.target) !== targetDomain) {
    throw new Error(`${AVANTIQO_LEARNING_TRANSFER_CONTRACT}_SOURCE_TARGET_DOMAIN_MISMATCH`);
  }

  const transferFingerprint = digest(
    "verified-transfer-hypothesis",
    sourceTopic,
    targetTopic,
    mechanismFingerprint,
    hypothesisFingerprint,
    evidenceFingerprint,
  );
  const nowIso = new Date().toISOString();
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: HYPOTHESIS_SCOPE,
    memory_key: `transfer-hypothesis:${transferFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Transfer hypothesis ${sourceDomain} -> ${targetDomain}`,
    content: "A cross-domain mechanism transfer hypothesis has passed the structural verification-entry gate and requires discriminating experiments before any epistemic reuse.",
    importance: 0.92,
    confidence: 1,
    source: "verified_cross_domain_transfer_hypothesis",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_LEARNING_TRANSFER_CONTRACT,
      status: "TRANSFER_HYPOTHESIS_EXPERIMENT_REQUIRED",
      transfer_fingerprint: transferFingerprint,
      source_topic_key: sourceTopic,
      source_domain: sourceDomain,
      target_topic_key: targetTopic,
      target_domain: targetDomain,
      mechanism_fingerprint: mechanismFingerprint,
      hypothesis_fingerprint: hypothesisFingerprint,
      evidence_fingerprint: evidenceFingerprint,
      verification_method: verificationMethod,
      source_contract: sourceContract,
      invariant_mechanisms: invariants,
      boundary_conditions: boundaries,
      falsifiers: falsifierList,
      discriminating_experiments: experiments,
      source_stable_mastery_verified: true,
      target_frontier_verified: true,
      cross_domain_verified: true,
      mechanism_mapping_verified: true,
      analogy_is_hypothesis_not_evidence: true,
      semantic_similarity_is_not_transfer_evidence: true,
      transfer_success_proven: false,
      experiment_execution_required: true,
      experiment_execution_performed: false,
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      customer_private_content_included: false,
      source_customer_identifiers_persisted: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      verified_at: nowIso,
    },
    updated_at: nowIso,
  };
  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_key,metadata")
    .single();
  if (written.error) throw written.error;

  const experimentRows = experiments.slice(0, MAX_EXPERIMENTS_PER_HYPOTHESIS).map((experiment, index) => ({
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: EXPERIMENT_SCOPE,
    memory_key: `transfer-experiment:${digest(transferFingerprint, index, experiment).slice(0, 40)}`,
    memory_type: "goal",
    subject: `Transfer experiment ${index + 1}: ${hypothesisFingerprint.slice(0, 16)}`,
    content: experiment,
    importance: Math.max(0.78, 0.9 - index * 0.03),
    confidence: 1,
    source: "cross_domain_transfer_experiment_proposal",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_LEARNING_TRANSFER_CONTRACT,
      status: "PROPOSED_GOVERNED_TRANSFER_EXPERIMENT",
      transfer_fingerprint: transferFingerprint,
      hypothesis_fingerprint: hypothesisFingerprint,
      mechanism_fingerprint: mechanismFingerprint,
      source_topic_key: sourceTopic,
      source_domain: sourceDomain,
      target_topic_key: targetTopic,
      target_domain: targetDomain,
      experiment_index: index + 1,
      boundary_conditions: boundaries,
      falsifiers: falsifierList,
      execution_performed: false,
      automatic_execution: false,
      provider_execution_performed: false,
      runpod_job_submitted: false,
      result_recorded: false,
      transfer_success_proven: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
      customer_private_content_allowed: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      proposed_at: nowIso,
    },
    updated_at: nowIso,
  }));
  const experimentWriteCount = await upsertRows(experimentRows);

  return {
    success: true,
    contract: AVANTIQO_LEARNING_TRANSFER_CONTRACT,
    status: "VERIFIED_TRANSFER_HYPOTHESIS_RECORDED_EXPERIMENTS_REQUIRED",
    transfer_hypothesis: written.data,
    experiment_proposal_count: experimentRows.length,
    experiment_proposal_write_count: experimentWriteCount,
    governance: {
      analogy_is_hypothesis_not_evidence: true,
      semantic_similarity_is_not_transfer_evidence: true,
      automatic_transfer_inference: false,
      experiment_execution_performed: false,
      platform_knowledge_written: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export async function reconcileAvantiqoLearningTransfer({ persist = true } = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_LEARNING_TRANSFER_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      discovery_count: 0,
    };
  }

  const state = await loadState(organizationId);
  const pairs = discoveryPairs(state.mastery, state.frontier);
  const nowIso = new Date().toISOString();
  const discoveries = pairs.map((pair) => discoveryRow(organizationId, pair, nowIso));
  const agendas = pairs.map((pair) => discoveryAgendaRow(organizationId, pair, nowIso));
  let discoveryWriteCount = 0;
  let agendaWriteCount = 0;
  if (persist) {
    [discoveryWriteCount, agendaWriteCount] = await Promise.all([
      upsertRows(discoveries),
      upsertRows(agendas),
    ]);
  }

  return {
    success: true,
    contract: AVANTIQO_LEARNING_TRANSFER_CONTRACT,
    status: pairs.length ? "CROSS_DOMAIN_TRANSFER_DISCOVERY_ACTIVE" : "NO_TRANSFER_DISCOVERY_CANDIDATES",
    stable_mastery_source_count: state.mastery.filter(stableMastery).length,
    active_frontier_target_count: state.frontier.filter(activeFrontier).length,
    discovery_count: pairs.length,
    discovery_write_count: discoveryWriteCount,
    discovery_agenda_write_count: agendaWriteCount,
    transfer_policy: {
      cross_domain_only: true,
      source_stable_mastery_required: true,
      target_active_frontier_required: true,
      analogy_is_hypothesis_not_evidence: true,
      semantic_similarity_is_not_transfer_evidence: true,
      implementation_copy_is_not_transfer_evidence: true,
      verified_mechanism_required_before_transfer_hypothesis: true,
      explicit_boundary_conditions_required: true,
      explicit_falsifiers_required: true,
      discriminating_experiments_required: true,
      transfer_hypothesis_does_not_prove_transfer: true,
      experiment_proposals_do_not_execute_automatically: true,
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

export const AvantiqoLearningTransferRuntime = Object.freeze({
  contract: AVANTIQO_LEARNING_TRANSFER_CONTRACT,
  reconcile: reconcileAvantiqoLearningTransfer,
  recordVerifiedHypothesis: recordAvantiqoVerifiedTransferHypothesis,
});
