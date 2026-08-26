import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_CONTRACT =
  "AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_V1";

const MEMORY_TABLE = "intelligence_memories";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const DEPENDENCY_SCOPE = "platform_learning_knowledge_dependencies";
const IMPACT_SCOPE = "platform_learning_knowledge_dependency_impacts";
const CURRICULUM_SCOPE = "platform_learning_curriculum_nodes";
const AGENDA_SCOPE = "platform_learning_agenda";
const RELEASE_EVENT_SCOPE = "platform_learning_knowledge_release_events";
const LIFECYCLE_EVENT_SCOPE = "platform_learning_knowledge_lifecycle_events";
const RELEASE_SOURCE = "avantiqo_explicit_final_knowledge_release";
const MAX_KNOWLEDGE_ROWS = 2000;
const MAX_DEPENDENCY_ROWS = 4000;
const MAX_EVENT_ROWS = 1500;
const MAX_IMPACT_WAVE = 25;
const MAX_IMPACT_DEPTH = 3;
const MAX_DISCOVERY_AGENDA = 8;
const EVENT_LOOKBACK_DAYS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

const HARD_RELATIONS = Object.freeze(new Set([
  "PREREQUISITE",
  "DERIVES_FROM",
  "ASSUMES",
  "CONSTRAINED_BY",
]));

const SOFT_RELATIONS = Object.freeze(new Set([
  "SHARED_EVIDENCE_CONTEXT",
  "SHARED_SYNTHESIS_LINEAGE",
  "RELATED_TOPIC",
]));

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function validFingerprint(value) {
  const normalized = text(value, 160).toLowerCase();
  return /^[a-f0-9]{16,128}$/.test(normalized) ? normalized : null;
}

function validRelation(value) {
  const normalized = text(value, 80).toUpperCase();
  if (HARD_RELATIONS.has(normalized) || SOFT_RELATIONS.has(normalized)) return normalized;
  return null;
}

function verifiedDependencyRow(row) {
  const metadata = object(row.metadata);
  const relation = validRelation(metadata.relation_type);
  return Boolean(
    row.active === true &&
      relation &&
      metadata.verified_dependency === true &&
      metadata.customer_private_content_included !== true &&
      metadata.raw_reasoning_persisted !== true &&
      validFingerprint(metadata.dependent_hypothesis_fingerprint) &&
      validFingerprint(metadata.prerequisite_hypothesis_fingerprint)
  );
}

function releaseFingerprint(row) {
  return validFingerprint(object(row.metadata).hypothesis_fingerprint);
}

function isReleasedKnowledge(row) {
  const metadata = object(row.metadata);
  return Boolean(
    row.source === RELEASE_SOURCE &&
      releaseFingerprint(row) &&
      metadata.customer_private_content_included !== true &&
      metadata.raw_reasoning_persisted !== true
  );
}

function canBeReused(row) {
  const metadata = object(row.metadata);
  if (!isReleasedKnowledge(row) || row.active !== true) return false;
  if (metadata.reusable_platform_knowledge !== true) return false;
  if (metadata.knowledge_router_reuse_allowed !== true) return false;
  if (metadata.release_status && text(metadata.release_status, 100) !== "RELEASED_MONITORED") return false;
  const validUntil = Date.parse(text(row.valid_until, 120));
  if (Number.isFinite(validUntil) && validUntil <= Date.now()) return false;
  return true;
}

function domainKey(row) {
  return text(object(row.metadata).knowledge_domain, 120).toLowerCase() || "platform";
}

function topicKey(row) {
  const metadata = object(row.metadata);
  return text(metadata.topic_key || metadata.root_topic_key || row.subject, 240) || "unknown";
}

function claimNodeKey(row) {
  return `claim:${releaseFingerprint(row)}`;
}

function topicNodeKey(row) {
  return `topic:${digest(domainKey(row), topicKey(row)).slice(0, 32)}`;
}

function domainNodeKey(row) {
  return `domain:${digest(domainKey(row)).slice(0, 32)}`;
}

function curriculumRows(organizationId, rows, dependencies, nowIso) {
  const nodes = new Map();
  const dependencyByDependent = new Map();
  for (const dependency of dependencies) {
    const metadata = object(dependency.metadata);
    const dependent = text(metadata.dependent_hypothesis_fingerprint, 128);
    const bucket = dependencyByDependent.get(dependent) || [];
    bucket.push(dependency);
    dependencyByDependent.set(dependent, bucket);
  }

  for (const row of rows.filter(isReleasedKnowledge)) {
    const fingerprint = releaseFingerprint(row);
    const domain = domainKey(row);
    const topic = topicKey(row);
    const domainKeyValue = domainNodeKey(row);
    const topicKeyValue = topicNodeKey(row);
    const claimKeyValue = claimNodeKey(row);
    const dependencyRows = dependencyByDependent.get(fingerprint) || [];
    const hardCount = dependencyRows.filter((item) =>
      HARD_RELATIONS.has(text(object(item.metadata).relation_type, 80).toUpperCase()),
    ).length;

    if (!nodes.has(domainKeyValue)) {
      nodes.set(domainKeyValue, {
        organization_id: organizationId,
        party_id: null,
        entity_id: null,
        conversation_id: null,
        source_turn_id: null,
        memory_scope: CURRICULUM_SCOPE,
        memory_key: domainKeyValue,
        memory_type: "goal",
        subject: `Learning domain: ${domain}`,
        content: `Hierarchical Learning curriculum root for the ${domain} domain.`,
        importance: 0.7,
        confidence: 1,
        source: "knowledge_dependency_curriculum",
        active: true,
        valid_until: null,
        superseded_by: null,
        superseded_at: null,
        forgotten_at: null,
        metadata: {
          contract: AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_CONTRACT,
          node_type: "DOMAIN",
          node_key: domainKeyValue,
          parent_node_key: null,
          curriculum_depth: 0,
          knowledge_domain: domain,
          automatic_knowledge_promotion: false,
          authorization_value: "none",
          customer_private_content_included: false,
          raw_reasoning_persisted: false,
          generated_at: nowIso,
        },
        updated_at: nowIso,
      });
    }

    if (!nodes.has(topicKeyValue)) {
      nodes.set(topicKeyValue, {
        organization_id: organizationId,
        party_id: null,
        entity_id: null,
        conversation_id: null,
        source_turn_id: null,
        memory_scope: CURRICULUM_SCOPE,
        memory_key: topicKeyValue,
        memory_type: "goal",
        subject: `Learning topic: ${topic}`,
        content: `Hierarchical Learning topic ${topic} in the ${domain} domain.`,
        importance: 0.78,
        confidence: 1,
        source: "knowledge_dependency_curriculum",
        active: true,
        valid_until: null,
        superseded_by: null,
        superseded_at: null,
        forgotten_at: null,
        metadata: {
          contract: AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_CONTRACT,
          node_type: "TOPIC",
          node_key: topicKeyValue,
          parent_node_key: domainKeyValue,
          curriculum_depth: 1,
          knowledge_domain: domain,
          topic_key: topic,
          automatic_knowledge_promotion: false,
          authorization_value: "none",
          customer_private_content_included: false,
          raw_reasoning_persisted: false,
          generated_at: nowIso,
        },
        updated_at: nowIso,
      });
    }

    nodes.set(claimKeyValue, {
      organization_id: organizationId,
      party_id: null,
      entity_id: null,
      conversation_id: null,
      source_turn_id: null,
      memory_scope: CURRICULUM_SCOPE,
      memory_key: claimKeyValue,
      memory_type: "goal",
      subject: `Learning claim: ${fingerprint.slice(0, 16)}`,
      content: `Hierarchical Learning claim node for released knowledge ${fingerprint.slice(0, 16)}.`,
      importance: Math.max(0.8, Number(row.importance || 0.8)),
      confidence: 1,
      source: "knowledge_dependency_curriculum",
      active: true,
      valid_until: row.valid_until || null,
      superseded_by: null,
      superseded_at: null,
      forgotten_at: null,
      metadata: {
        contract: AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_CONTRACT,
        node_type: "CLAIM",
        node_key: claimKeyValue,
        parent_node_key: topicKeyValue,
        curriculum_depth: 2,
        hypothesis_fingerprint: fingerprint,
        knowledge_memory_key: row.memory_key,
        knowledge_domain: domain,
        topic_key: topic,
        release_active: row.active === true,
        router_reusable: canBeReused(row),
        verified_dependency_count: dependencyRows.length,
        verified_hard_dependency_count: hardCount,
        dependency_discovery_required: dependencyRows.length === 0,
        automatic_knowledge_promotion: false,
        authorization_value: "none",
        customer_private_content_included: false,
        raw_reasoning_persisted: false,
        generated_at: nowIso,
      },
      updated_at: nowIso,
    });
  }

  return [...nodes.values()];
}

async function loadKnowledgeByFingerprint(organizationId, fingerprintValue, { activeOnly = false } = {}) {
  let query = supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,importance,confidence,source,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", KNOWLEDGE_SCOPE)
    .eq("source", RELEASE_SOURCE)
    .eq("metadata->>hypothesis_fingerprint", fingerprintValue);
  if (activeOnly) query = query.eq("active", true);
  const result = await query.order("updated_at", { ascending: false }).limit(2);
  if (result.error) throw result.error;
  return list(result.data)[0] || null;
}

export async function recordAvantiqoVerifiedKnowledgeDependency({
  dependent_hypothesis_fingerprint,
  prerequisite_hypothesis_fingerprint,
  relation_type,
  verification_method,
  evidence_fingerprint,
  source_contract,
  propagation_enabled = null,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error("AVANTIQO_KNOWLEDGE_DEPENDENCY_LEARNING_ORGANIZATION_REQUIRED");
  }
  const dependentFingerprint = validFingerprint(dependent_hypothesis_fingerprint);
  const prerequisiteFingerprint = validFingerprint(prerequisite_hypothesis_fingerprint);
  const relation = validRelation(relation_type);
  const verificationMethod = text(verification_method, 120);
  const evidenceFingerprint = validFingerprint(evidence_fingerprint);
  const sourceContract = text(source_contract, 180);
  if (!dependentFingerprint || !prerequisiteFingerprint) {
    throw new Error("AVANTIQO_KNOWLEDGE_DEPENDENCY_FINGERPRINT_INVALID");
  }
  if (dependentFingerprint === prerequisiteFingerprint) {
    throw new Error("AVANTIQO_KNOWLEDGE_DEPENDENCY_SELF_DEPENDENCY_FORBIDDEN");
  }
  if (!relation) throw new Error("AVANTIQO_KNOWLEDGE_DEPENDENCY_RELATION_INVALID");
  if (!verificationMethod || !evidenceFingerprint || !sourceContract) {
    throw new Error("AVANTIQO_KNOWLEDGE_DEPENDENCY_VERIFICATION_EVIDENCE_REQUIRED");
  }

  const [dependent, prerequisite] = await Promise.all([
    loadKnowledgeByFingerprint(organizationId, dependentFingerprint, { activeOnly: true }),
    loadKnowledgeByFingerprint(organizationId, prerequisiteFingerprint, { activeOnly: true }),
  ]);
  if (!dependent || !prerequisite || !isReleasedKnowledge(dependent) || !isReleasedKnowledge(prerequisite)) {
    throw new Error("AVANTIQO_KNOWLEDGE_DEPENDENCY_RELEASED_KNOWLEDGE_REQUIRED");
  }

  const hard = HARD_RELATIONS.has(relation);
  const propagation = propagation_enabled === null || propagation_enabled === undefined
    ? hard
    : propagation_enabled === true && hard;
  const dependencyFingerprint = digest(
    "verified-knowledge-dependency",
    dependentFingerprint,
    prerequisiteFingerprint,
    relation,
    evidenceFingerprint,
  );
  const nowIso = new Date().toISOString();
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: DEPENDENCY_SCOPE,
    memory_key: `knowledge-dependency:${dependencyFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: dependentFingerprint,
    content: `Verified structural knowledge dependency ${relation}.`,
    importance: hard ? 0.94 : 0.74,
    confidence: 1,
    source: "verified_knowledge_dependency",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_CONTRACT,
      dependency_fingerprint: dependencyFingerprint,
      dependent_hypothesis_fingerprint: dependentFingerprint,
      prerequisite_hypothesis_fingerprint: prerequisiteFingerprint,
      relation_type: relation,
      relation_strength: hard ? "HARD" : "SOFT",
      verified_dependency: true,
      verification_method: verificationMethod,
      evidence_fingerprint: evidenceFingerprint,
      source_contract: sourceContract,
      propagation_enabled: propagation,
      semantic_similarity_inference_used: false,
      raw_claim_text_persisted: false,
      raw_evidence_persisted: false,
      customer_private_content_included: false,
      source_customer_identifiers_persisted: false,
      raw_reasoning_persisted: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
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
  return {
    success: true,
    contract: AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_CONTRACT,
    status: "VERIFIED_DEPENDENCY_RECORDED",
    dependency: written.data,
    governance: {
      semantic_similarity_inference_used: false,
      live_knowledge_modified: false,
      automatic_dependency_inference: false,
      automatic_knowledge_promotion: false,
      authorization_effect: "NONE",
    },
  };
}

async function loadState(organizationId) {
  const cutoff = new Date(Date.now() - EVENT_LOOKBACK_DAYS * DAY_MS).toISOString();
  const [knowledge, dependencies, releaseEvents, lifecycleEvents] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", KNOWLEDGE_SCOPE)
      .eq("source", RELEASE_SOURCE)
      .order("updated_at", { ascending: false })
      .limit(MAX_KNOWLEDGE_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,active,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", DEPENDENCY_SCOPE)
      .eq("active", true)
      .limit(MAX_DEPENDENCY_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,active,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", RELEASE_EVENT_SCOPE)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENT_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,active,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", LIFECYCLE_EVENT_SCOPE)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENT_ROWS),
  ]);
  for (const result of [knowledge, dependencies, releaseEvents, lifecycleEvents]) {
    if (result.error) throw result.error;
  }
  return {
    knowledge: list(knowledge.data).filter(isReleasedKnowledge),
    dependencies: list(dependencies.data).filter(verifiedDependencyRow),
    releaseEvents: list(releaseEvents.data),
    lifecycleEvents: list(lifecycleEvents.data),
  };
}

function disruptionTriggers(state) {
  const triggers = [];
  for (const row of state.releaseEvents) {
    const metadata = object(row.metadata);
    if (text(metadata.event, 80) !== "QUARANTINED") continue;
    const fingerprintValue = validFingerprint(metadata.hypothesis_fingerprint);
    if (!fingerprintValue) continue;
    triggers.push({
      trigger_id: row.memory_key,
      hypothesis_fingerprint: fingerprintValue,
      event: "QUARANTINED",
      reason: text(metadata.reason, 500) || "UPSTREAM_KNOWLEDGE_QUARANTINED",
      observed_at: text(metadata.observed_at || row.created_at, 120) || null,
    });
  }
  for (const row of state.lifecycleEvents) {
    const metadata = object(row.metadata);
    if (!["EXPIRED_RETIRED"].includes(text(metadata.event, 80))) continue;
    const sourceMemoryKey = text(metadata.source_knowledge_memory_key, 220);
    const source = state.knowledge.find((knowledge) => knowledge.memory_key === sourceMemoryKey);
    const fingerprintValue = source ? releaseFingerprint(source) : null;
    if (!fingerprintValue) continue;
    triggers.push({
      trigger_id: row.memory_key,
      hypothesis_fingerprint: fingerprintValue,
      event: "EXPIRED_RETIRED",
      reason: text(metadata.reason, 500) || "UPSTREAM_KNOWLEDGE_EXPIRED",
      observed_at: text(metadata.observed_at || row.created_at, 120) || null,
    });
  }
  const unique = new Map();
  for (const trigger of triggers) unique.set(`${trigger.trigger_id}:${trigger.hypothesis_fingerprint}`, trigger);
  return [...unique.values()];
}

function hardReverseGraph(dependencies) {
  const reverse = new Map();
  for (const dependency of dependencies) {
    const metadata = object(dependency.metadata);
    const relation = text(metadata.relation_type, 80).toUpperCase();
    if (!HARD_RELATIONS.has(relation) || metadata.propagation_enabled !== true) continue;
    const prerequisite = text(metadata.prerequisite_hypothesis_fingerprint, 128);
    const dependent = text(metadata.dependent_hypothesis_fingerprint, 128);
    const bucket = reverse.get(prerequisite) || [];
    bucket.push({ dependency, dependent, prerequisite, relation });
    reverse.set(prerequisite, bucket);
  }
  return reverse;
}

function propagationWave(triggers, dependencies, knowledgeByFingerprint) {
  const reverse = hardReverseGraph(dependencies);
  const queue = triggers.map((trigger) => ({
    root_trigger: trigger,
    upstream_fingerprint: trigger.hypothesis_fingerprint,
    depth: 0,
    path: [trigger.hypothesis_fingerprint],
  }));
  const impacts = [];
  const seen = new Set();
  while (queue.length && impacts.length < MAX_IMPACT_WAVE) {
    const current = queue.shift();
    if (current.depth >= MAX_IMPACT_DEPTH) continue;
    for (const edge of reverse.get(current.upstream_fingerprint) || []) {
      const key = `${current.root_trigger.trigger_id}:${edge.dependent}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const dependentRow = knowledgeByFingerprint.get(edge.dependent);
      if (!dependentRow || !canBeReused(dependentRow)) continue;
      const depth = current.depth + 1;
      const path = [...current.path, edge.dependent];
      impacts.push({
        trigger: current.root_trigger,
        edge,
        dependentRow,
        depth,
        path,
      });
      queue.push({
        root_trigger: current.root_trigger,
        upstream_fingerprint: edge.dependent,
        depth,
        path,
      });
      if (impacts.length >= MAX_IMPACT_WAVE) break;
    }
  }
  return impacts;
}

function impactRow({ organizationId, impact, nowIso }) {
  const dependentFingerprint = releaseFingerprint(impact.dependentRow);
  const impactFingerprint = digest(
    "knowledge-dependency-impact",
    impact.trigger.trigger_id,
    dependentFingerprint,
    impact.depth,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: IMPACT_SCOPE,
    memory_key: `knowledge-dependency-impact:${impactFingerprint.slice(0, 40)}`,
    memory_type: "blocker",
    subject: dependentFingerprint,
    content: `Verified prerequisite disruption requires dependent knowledge revalidation at wave depth ${impact.depth}.`,
    importance: Math.max(0.9, 1 - (impact.depth - 1) * 0.04),
    confidence: 1,
    source: "knowledge_dependency_impact",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_CONTRACT,
      status: "DEPENDENCY_HOLD_REVALIDATION_REQUIRED",
      trigger_id: impact.trigger.trigger_id,
      trigger_event: impact.trigger.event,
      trigger_reason: impact.trigger.reason,
      upstream_hypothesis_fingerprint: impact.edge.prerequisite,
      dependent_hypothesis_fingerprint: dependentFingerprint,
      relation_type: impact.edge.relation,
      propagation_depth: impact.depth,
      propagation_path: impact.path,
      fail_closed_dependency_hold: true,
      dependent_claim_proven_false: false,
      revalidation_required_before_reuse: true,
      automatic_restore_allowed: false,
      automatic_knowledge_promotion: false,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      created_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function impactAgendaRow({ organizationId, impact, nowIso }) {
  const row = impact.dependentRow;
  const fingerprintValue = releaseFingerprint(row);
  const domainNode = domainNodeKey(row);
  const topicNode = topicNodeKey(row);
  const claimNode = claimNodeKey(row);
  const impactFingerprint = digest(impact.trigger.trigger_id, fingerprintValue);
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AGENDA_SCOPE,
    memory_key: `dependency-revalidate:${impactFingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: `dependency-revalidate-${fingerprintValue.slice(0, 20)}`,
    content: [
      `Revalidate this dependent released knowledge claim after a verified prerequisite disruption: ${text(row.content, 5000)}`,
      `Prerequisite event: ${impact.trigger.event}; relation: ${impact.edge.relation}; wave depth: ${impact.depth}.`,
      "Test whether the dependent claim still holds under the changed prerequisite. Search for current authoritative evidence, boundary conditions, counterexamples and alternative mechanisms.",
      "Do not automatically restore the old claim. It must re-enter the normal epistemic, benchmark and explicit-release pipeline.",
    ].join(" "),
    importance: Math.max(0.92, 1 - (impact.depth - 1) * 0.03),
    confidence: 1,
    source: "knowledge_dependency_curriculum_revalidation",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_CONTRACT,
      continuous_learning: true,
      self_directed_learning: true,
      dependency_revalidation: true,
      topic_key: `dependency-${fingerprintValue.slice(0, 20)}`,
      parent_topic_key: topicKey(row),
      knowledge_domain: domainKey(row),
      research_mode: impact.depth >= 2 ? "mechanism" : "evidence",
      status: "READY",
      next_research_at: nowIso,
      curriculum_path: [domainNode, topicNode, claimNode],
      curriculum_depth: 2 + impact.depth,
      dependency_wave_depth: impact.depth,
      dependency_relation: impact.edge.relation,
      trigger_event: impact.trigger.event,
      trigger_reason: impact.trigger.reason,
      contradiction_search_required: true,
      boundary_condition_search_required: true,
      alternative_mechanism_search_required: true,
      automatic_restore_allowed: false,
      automatic_knowledge_promotion: false,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
    },
    updated_at: nowIso,
  };
}

function dependencyDiscoveryAgendaRow({ organizationId, row, nowIso }) {
  const fingerprintValue = releaseFingerprint(row);
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AGENDA_SCOPE,
    memory_key: `dependency-discovery:${fingerprintValue.slice(0, 40)}`,
    memory_type: "goal",
    subject: `dependency-discovery-${fingerprintValue.slice(0, 20)}`,
    content: [
      `Map the explicit prerequisites and dependency structure of this released platform knowledge claim: ${text(row.content, 5000)}`,
      "Identify which other verified claims this claim actually requires, derives from, assumes or is constrained by.",
      "Do not infer dependencies from mere topical similarity. Require structural or evidentiary justification and preserve falsifiability.",
    ].join(" "),
    importance: Math.max(0.74, Number(row.importance || 0.8)),
    confidence: 1,
    source: "knowledge_dependency_discovery_curriculum",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_CONTRACT,
      continuous_learning: true,
      self_directed_learning: true,
      dependency_discovery: true,
      topic_key: `dependency-discovery-${fingerprintValue.slice(0, 20)}`,
      parent_topic_key: topicKey(row),
      knowledge_domain: domainKey(row),
      research_mode: "mechanism",
      status: "READY",
      next_research_at: nowIso,
      curriculum_path: [domainNodeKey(row), topicNodeKey(row), claimNodeKey(row)],
      curriculum_depth: 3,
      target_hypothesis_fingerprint: fingerprintValue,
      structural_dependency_evidence_required: true,
      semantic_similarity_is_not_dependency_evidence: true,
      record_via_contract: AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_CONTRACT,
      automatic_dependency_creation: false,
      automatic_knowledge_promotion: false,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
    },
    updated_at: nowIso,
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

async function applyDependencyHold({ organizationId, impact, nowIso }) {
  const row = impact.dependentRow;
  const metadata = object(row.metadata);
  const nextMetadata = {
    ...metadata,
    release_status: "DEPENDENCY_HOLD",
    dependency_hold: true,
    dependency_hold_contract: AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_CONTRACT,
    dependency_hold_trigger_event: impact.trigger.event,
    dependency_hold_trigger_reason: impact.trigger.reason,
    dependency_hold_upstream_hypothesis_fingerprint: impact.edge.prerequisite,
    dependency_hold_relation_type: impact.edge.relation,
    dependency_hold_depth: impact.depth,
    dependency_hold_at: nowIso,
    reusable_platform_knowledge: false,
    knowledge_router_reuse_allowed: false,
    automatic_unquarantine_allowed: false,
    automatic_dependency_unhold_allowed: false,
    automatic_knowledge_promotion: false,
  };
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      forgotten_at: nowIso,
      metadata: nextMetadata,
      updated_at: nowIso,
    })
    .eq("organization_id", organizationId)
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .select("id")
    .maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data?.id);
}

export async function reconcileAvantiqoKnowledgeDependencyCurriculum({ persist = true } = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      released_knowledge_count: 0,
    };
  }

  const state = await loadState(organizationId);
  const nowIso = new Date().toISOString();
  const knowledgeByFingerprint = new Map(
    state.knowledge.map((row) => [releaseFingerprint(row), row]).filter(([key]) => Boolean(key)),
  );
  const curriculum = curriculumRows(organizationId, state.knowledge, state.dependencies, nowIso);
  const triggers = disruptionTriggers(state);
  const impacts = propagationWave(triggers, state.dependencies, knowledgeByFingerprint);
  const impactRows = impacts.map((impact) => impactRow({ organizationId, impact, nowIso }));
  const impactAgendas = impacts.map((impact) => impactAgendaRow({ organizationId, impact, nowIso }));

  const dependentFingerprints = new Set(
    state.dependencies.map((row) => text(object(row.metadata).dependent_hypothesis_fingerprint, 128)),
  );
  const discoveryCandidates = state.knowledge
    .filter(canBeReused)
    .filter((row) => !dependentFingerprints.has(releaseFingerprint(row)))
    .sort((left, right) => Number(right.importance || 0) - Number(left.importance || 0))
    .slice(0, MAX_DISCOVERY_AGENDA);
  const discoveryAgendas = discoveryCandidates.map((row) =>
    dependencyDiscoveryAgendaRow({ organizationId, row, nowIso }),
  );

  let dependencyHoldCount = 0;
  let curriculumWriteCount = 0;
  let impactWriteCount = 0;
  let agendaWriteCount = 0;
  if (persist) {
    for (const impact of impacts) {
      if (await applyDependencyHold({ organizationId, impact, nowIso })) {
        dependencyHoldCount += 1;
      }
    }
    [curriculumWriteCount, impactWriteCount, agendaWriteCount] = await Promise.all([
      upsertRows(curriculum),
      upsertRows(impactRows),
      upsertRows([...impactAgendas, ...discoveryAgendas]),
    ]);
  }

  const hardDependencies = state.dependencies.filter((row) =>
    HARD_RELATIONS.has(text(object(row.metadata).relation_type, 80).toUpperCase()),
  );
  const softDependencies = state.dependencies.filter((row) =>
    SOFT_RELATIONS.has(text(object(row.metadata).relation_type, 80).toUpperCase()),
  );

  return {
    success: true,
    contract: AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_CONTRACT,
    status: impacts.length
      ? "DEPENDENCY_RELEARNING_WAVE_REQUIRED"
      : discoveryAgendas.length
        ? "DEPENDENCY_DISCOVERY_ACTIVE"
        : "DEPENDENCY_CURRICULUM_HEALTHY",
    released_knowledge_count: state.knowledge.length,
    verified_dependency_count: state.dependencies.length,
    verified_hard_dependency_count: hardDependencies.length,
    verified_soft_dependency_count: softDependencies.length,
    disruption_trigger_count: triggers.length,
    propagated_impact_count: impacts.length,
    dependency_hold_count: dependencyHoldCount,
    curriculum_node_count: curriculum.length,
    curriculum_node_write_count: curriculumWriteCount,
    dependency_impact_write_count: impactWriteCount,
    dependency_discovery_agenda_count: discoveryAgendas.length,
    relearning_agenda_write_count: agendaWriteCount,
    propagation_policy: {
      maximum_wave_size: MAX_IMPACT_WAVE,
      maximum_propagation_depth: MAX_IMPACT_DEPTH,
      verified_hard_dependencies_only: true,
      soft_relationships_disable_knowledge: false,
      semantic_similarity_inference_used: false,
      upstream_disruption_proves_dependent_false: false,
      upstream_disruption_blocks_dependent_reuse_until_revalidated: true,
      bounded_relearning_wave: true,
      automatic_dependency_unhold_allowed: false,
      fresh_release_cycle_required_after_hold: true,
    },
    curriculum_policy: {
      hierarchy: ["DOMAIN", "TOPIC", "CLAIM"],
      dependency_discovery_for_unmapped_released_claims: true,
      structural_dependency_evidence_required: true,
      semantic_similarity_is_not_dependency_evidence: true,
      deeper_dependency_waves_escalate_to_mechanism_research: true,
      curriculum_does_not_bypass_epistemic_pipeline: true,
    },
    governance: {
      provider_free: true,
      web_research_executed_here: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      automatic_knowledge_release: false,
      automatic_knowledge_restore: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoKnowledgeDependencyCurriculumRuntime = Object.freeze({
  contract: AVANTIQO_KNOWLEDGE_DEPENDENCY_CURRICULUM_CONTRACT,
  recordDependency: recordAvantiqoVerifiedKnowledgeDependency,
  reconcile: reconcileAvantiqoKnowledgeDependencyCurriculum,
});
