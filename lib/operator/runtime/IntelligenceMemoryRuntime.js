import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { semanticMemoryRelevance } from "./IntelligenceSemanticMemoryPolicy";

const MEMORY_TABLE = "intelligence_memories";
const MAX_RECALL = 12;
const MEMORY_TYPES = new Set([
  "goal",
  "decision",
  "constraint",
  "preference",
  "fact",
  "lesson",
  "completed_step",
  "blocker",
  "relationship",
]);
const TYPE_HALF_LIFE_DAYS = {
  goal: 365,
  decision: 720,
  constraint: 720,
  preference: 720,
  fact: 45,
  lesson: 540,
  completed_step: 365,
  blocker: 21,
  relationship: 720,
};
const WORKFLOW_GATE_REASONS = new Set([
  "CONFIRMATION_REQUIRED",
  "VOICE_CONFIRMATION_REQUIRED",
  "APPROVAL_REQUIRED",
  "APPROVAL_PENDING",
  "APPROVAL_REQUESTED",
]);
const PRODUCT_ENGINEERING_REFINEMENT_SUPERSESSION_SOURCE =
  "product_engineering_recommendation_refinement";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function uniqueStrings(value, limit = 20, itemLimit = 600) {
  return Array.from(
    new Set(list(value).map((item) => text(item, itemLimit)).filter(Boolean)),
  ).slice(0, limit);
}

function tokens(value) {
  return Array.from(
    new Set(
      text(value, 12000)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\u0e00-\u0e7f\s_-]/g, " ")
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 1),
    ),
  ).slice(0, 80);
}

function memoryScope({ partyId = null, entityId = null, scope = "organization" } = {}) {
  if (scope === "party" && text(partyId)) return `party:${text(partyId, 120)}`;
  if (scope === "entity" && text(entityId)) return `entity:${text(entityId, 120)}`;
  return "organization";
}

function memoryKey(type, content) {
  return `${type}:${createHash("sha256").update(text(content, 2000).toLowerCase()).digest("hex").slice(0, 24)}`;
}

function ageDays(row, nowMs = Date.now()) {
  const timestamp = new Date(row?.updated_at || row?.created_at || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - timestamp) / (24 * 60 * 60 * 1000));
}

function freshnessScore(row) {
  const type = text(row?.memory_type, 80) || "fact";
  const halfLife = Number(TYPE_HALF_LIFE_DAYS[type] || 180);
  const age = ageDays(row);
  if (!Number.isFinite(age)) return 0;
  return Math.pow(0.5, age / Math.max(1, halfLife));
}

function freshnessClass(row) {
  const age = ageDays(row);
  if (!Number.isFinite(age)) return "unknown";
  if (age <= 7) return "recent";
  if (age <= 45) return "established";
  if (age <= 180) return "old";
  return "historical";
}

export function normalizeIntelligenceMemory(row) {
  const metadata = object(row?.metadata);
  return {
    id: row.id,
    scope: row.memory_scope,
    type: row.memory_type,
    subject: row.subject || null,
    content: text(row.content, 1600),
    importance: Number(row.importance || 0),
    confidence: Number(row.confidence || 0),
    valid_until: row.valid_until || null,
    updated_at: row.updated_at || null,
    freshness: freshnessClass(row),
    requires_live_read: row.memory_type === "fact",
    business_effect_verified: metadata.business_effect_verified === true,
  };
}

function isRecallable(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  if (row?.forgotten_at || row?.superseded_at || row?.superseded_by) return false;
  if (!row?.valid_until) return true;
  const expiry = Date.parse(row.valid_until);
  return !Number.isFinite(expiry) || expiry > nowMs;
}

function typeIntentBoost(type, query) {
  const source = text(query, 12000).toLowerCase();
  let boost = 0;

  if (/\b(continue|resume|next|where are we|where did we stop|what remains|what is left|what's left|status|progress)\b/i.test(source)) {
    if (["goal", "decision", "constraint", "completed_step", "blocker"].includes(type)) boost += 0.12;
  }
  if (/\b(prefer|preference|like|dislike|style|always|never|must|constraint|requirement)\b/i.test(source)) {
    if (["preference", "constraint", "decision"].includes(type)) boost += 0.1;
  }
  if (/\b(why|mistake|lesson|learn|failed|failure|problem|issue|blocker)\b/i.test(source)) {
    if (["lesson", "blocker", "decision"].includes(type)) boost += 0.1;
  }
  if (/\b(person|people|customer|client|vendor|supplier|partner|relationship|contact)\b/i.test(source)) {
    if (["relationship", "fact"].includes(type)) boost += 0.08;
  }

  return Math.min(0.2, boost);
}

function scopeAffinity(row, { partyId = null, entityId = null } = {}) {
  const scope = text(row?.memory_scope, 180);
  if (entityId && scope === memoryScope({ entityId, scope: "entity" })) return 0.1;
  if (partyId && scope === memoryScope({ partyId, scope: "party" })) return 0.08;
  return scope === "organization" ? 0.02 : 0;
}

function relevance(row, queryTokens, { query = "", partyId = null, entityId = null } = {}) {
  const haystack = `${text(row.subject)} ${text(row.content)}`.toLowerCase();
  let lexical = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) lexical += 1;
  }
  lexical = queryTokens.length ? lexical / Math.min(queryTokens.length, 12) : 0;

  const semantic = semanticMemoryRelevance(row, query).score;
  const importance = Math.max(0, Math.min(1, Number(row.importance || 0)));
  const confidence = Math.max(0, Math.min(1, Number(row.confidence || 0)));
  const freshness = freshnessScore(row);
  const recallStrength = Math.min(0.05, Math.log1p(Math.max(0, Number(row.recall_count || 0))) * 0.012);
  const type = text(row.memory_type, 80);
  const mutableFactPenalty = type === "fact" && ageDays(row) > 30 ? 0.08 : 0;

  return Math.max(
    0,
    lexical * 0.26 +
      semantic * 0.34 +
      importance * 0.18 +
      confidence * 0.07 +
      freshness * 0.07 +
      recallStrength +
      typeIntentBoost(type, query) +
      scopeAffinity(row, { partyId, entityId }) -
      mutableFactPenalty,
  );
}

function memorySimilarity(left, right) {
  const a = new Set(tokens(`${left?.subject || ""} ${left?.content || ""}`).slice(0, 40));
  const b = new Set(tokens(`${right?.subject || ""} ${right?.content || ""}`).slice(0, 40));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function selectDiverseMemories(entries, limit) {
  const selected = [];
  const perType = new Map();

  for (const entry of entries) {
    if (selected.length >= limit) break;
    const type = text(entry?.row?.memory_type, 80) || "unknown";
    const typeCount = Number(perType.get(type) || 0);
    if (typeCount >= 4) continue;

    const duplicate = selected.some((existing) =>
      existing.row.memory_type === entry.row.memory_type &&
      existing.row.memory_scope === entry.row.memory_scope &&
      memorySimilarity(existing.row, entry.row) >= 0.82,
    );
    if (duplicate) continue;

    selected.push(entry);
    perType.set(type, typeCount + 1);
  }

  return selected;
}

export async function recallIntelligenceMemory({
  organizationId,
  partyId = null,
  entityId = null,
  message = "",
  projectState = {},
  limit = MAX_RECALL,
} = {}) {
  const organization = text(organizationId, 120);
  if (!organization) throw new Error("INTELLIGENCE_MEMORY_ORGANIZATION_REQUIRED");

  const scopes = ["organization"];
  if (text(partyId)) scopes.push(memoryScope({ partyId, scope: "party" }));
  if (text(entityId)) scopes.push(memoryScope({ entityId, scope: "entity" }));

  const query = [
    message,
    projectState?.objective,
    projectState?.progress_summary,
    projectState?.next_step,
    ...list(projectState?.decisions).slice(-6),
    ...list(projectState?.constraints).slice(-6),
  ].filter(Boolean).join(" ");
  const queryTokens = tokens(query);

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_scope,memory_type,subject,content,importance,confidence,active,recall_count,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
    .eq("organization_id", organization)
    .eq("active", true)
    .in("memory_scope", scopes)
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(100);

  if (result.error) throw result.error;

  const ranked = list(result.data)
    .filter((row) => isRecallable(row))
    .map((row) => ({
      row,
      score: relevance(row, queryTokens, { query, partyId, entityId }),
      semantic: semanticMemoryRelevance(row, query),
    }))
    .filter((entry) => entry.score >= 0.12 || Number(entry.row.importance || 0) >= 0.85)
    .sort((a, b) => b.score - a.score);

  const selected = selectDiverseMemories(
    ranked,
    Math.max(1, Math.min(MAX_RECALL, Number(limit) || MAX_RECALL)),
  );

  const ids = selected.map((entry) => entry.row.id).filter(Boolean);
  if (ids.length) {
    const recalledAt = new Date().toISOString();
    Promise.all(
      ids.map(async (id) => {
        const current = selected.find((entry) => entry.row.id === id)?.row;
        const nextCount = Number(current?.recall_count || 0) + 1;
        await supabaseAdmin
          .from(MEMORY_TABLE)
          .update({ recall_count: nextCount, last_recalled_at: recalledAt })
          .eq("organization_id", organization)
          .eq("id", id);
      }),
    ).catch((error) => console.error("INTELLIGENCE_MEMORY_RECALL_MARK_FAILED", error));
  }

  return selected.map((entry) => ({
    ...normalizeIntelligenceMemory(entry.row),
    relevance: Number(entry.score.toFixed(4)),
    semantic_relevance: Number(entry.semantic.score.toFixed(4)),
    semantic_mode: entry.semantic.mode,
  }));
}

function candidate(
  type,
  content,
  {
    subject = null,
    importance = 0.7,
    confidence = 1,
    scope = "organization",
    ttlDays = null,
    metadata = {},
  } = {},
) {
  const clean = text(content, 1600);
  if (!clean || !MEMORY_TYPES.has(type)) return null;
  return {
    type,
    content: clean,
    subject: text(subject, 300) || null,
    importance,
    confidence,
    scope,
    ttlDays: Number.isFinite(Number(ttlDays)) ? Number(ttlDays) : null,
    metadata: object(metadata),
  };
}

function capabilityKeyFromExecution(execution = {}) {
  return text(
    execution?.capability?.key ||
      execution?.capability_key ||
      execution?.requested_capability_key,
    300,
  );
}

function executionOutcomeCandidates(previousState = {}, nextState = {}) {
  const previousExecution = object(previousState?.last_execution);
  const execution = object(nextState?.last_execution);
  const capabilityKey = capabilityKeyFromExecution(execution);
  const status = text(execution.status, 80).toLowerCase();
  if (!capabilityKey || !status) return [];

  const previousSignature = [
    capabilityKeyFromExecution(previousExecution),
    text(previousExecution.status, 80).toLowerCase(),
    text(previousExecution.reason, 300),
  ].join("|");
  const currentSignature = [
    capabilityKey,
    status,
    text(execution.reason, 300),
  ].join("|");
  if (previousSignature === currentSignature) return [];

  const capabilityMode = text(execution?.capability?.mode, 80).toLowerCase();
  const verification = object(execution.post_action_verification);
  const verificationStatus = text(verification.status, 80).toLowerCase();
  const output = [];

  if (status === "completed" && capabilityMode !== "read") {
    output.push(candidate(
      "completed_step",
      verificationStatus === "completed"
        ? `Executed ${capabilityKey} successfully and verified the business effect.`
        : `Executed ${capabilityKey} successfully.`,
      {
        subject: capabilityKey,
        importance: verificationStatus === "completed" ? 0.86 : 0.76,
        scope: "party",
        metadata: {
          learned_from: "verified_operator_execution",
          execution_status: status,
          business_effect_verified: verificationStatus === "completed",
        },
      },
    ));

    if (verificationStatus && verificationStatus !== "completed") {
      const reason = text(verification.reason || verification.error, 500) || "Post-action verification did not complete";
      output.push(candidate(
        "blocker",
        `Verification after ${capabilityKey} is incomplete: ${reason}`,
        {
          subject: capabilityKey,
          importance: 0.84,
          scope: "party",
          ttlDays: 14,
          metadata: {
            learned_from: "operator_post_action_verification",
            execution_status: status,
            verification_status: verificationStatus,
          },
        },
      ));
    }
  }

  if (["blocked", "failed"].includes(status)) {
    const reason = text(execution.reason || execution.error, 500).toUpperCase();
    if (reason && !WORKFLOW_GATE_REASONS.has(reason)) {
      output.push(candidate(
        "blocker",
        `${capabilityKey} ${status}: ${text(execution.reason || execution.error, 500)}`,
        {
          subject: capabilityKey,
          importance: status === "failed" ? 0.8 : 0.72,
          scope: "party",
          ttlDays: status === "failed" ? 7 : 14,
          metadata: {
            learned_from: "operator_execution_outcome",
            execution_status: status,
          },
        },
      ));
    }
  }

  return output.filter(Boolean);
}

function projectMemoryCandidates(previousState = {}, nextState = {}) {
  const previous = object(previousState);
  const next = object(nextState);
  const output = [];

  if (text(next.objective) && text(next.objective) !== text(previous.objective)) {
    output.push(candidate("goal", next.objective, {
      importance: 0.96,
      scope: "party",
      metadata: { durability: "durable" },
    }));
  }

  const previousDecisions = new Set(uniqueStrings(previous.decisions).map((item) => item.toLowerCase()));
  for (const item of uniqueStrings(next.decisions)) {
    if (!previousDecisions.has(item.toLowerCase())) {
      output.push(candidate("decision", item, {
        importance: 0.96,
        scope: "party",
        metadata: { durability: "durable" },
      }));
    }
  }

  const previousConstraints = new Set(uniqueStrings(previous.constraints).map((item) => item.toLowerCase()));
  for (const item of uniqueStrings(next.constraints)) {
    if (!previousConstraints.has(item.toLowerCase())) {
      output.push(candidate("constraint", item, {
        importance: 0.92,
        scope: "party",
        metadata: { durability: "durable" },
      }));
    }
  }

  const previousSteps = new Set(uniqueStrings(previous.completed_steps).map((item) => item.toLowerCase()));
  for (const item of uniqueStrings(next.completed_steps)) {
    if (!previousSteps.has(item.toLowerCase())) {
      output.push(candidate("completed_step", item, {
        importance: 0.74,
        scope: "party",
        metadata: { durability: "durable" },
      }));
    }
  }

  if (text(next.blocker) && text(next.blocker) !== text(previous.blocker)) {
    output.push(candidate("blocker", next.blocker, {
      importance: 0.82,
      scope: "party",
      ttlDays: 14,
      metadata: { durability: "transient" },
    }));
  }

  output.push(...executionOutcomeCandidates(previous, next));
  return output.filter(Boolean);
}

function decisionSupersessionSignature(value) {
  const candidate = object(value);
  return [
    text(candidate.previous, 500).toLowerCase(),
    text(candidate.replacement, 500).toLowerCase(),
    text(candidate.source, 120).toLowerCase(),
  ].join("|");
}

function productDecisionSupersession(previousState = {}, nextState = {}) {
  const previous = object(previousState);
  const next = object(nextState);
  const marker = object(next.last_decision_supersession);
  const previousDecision = text(marker.previous, 500);
  const replacementDecision = text(marker.replacement, 500);
  if (
    text(marker.source, 120) !==
      PRODUCT_ENGINEERING_REFINEMENT_SUPERSESSION_SOURCE ||
    !previousDecision ||
    !replacementDecision ||
    previousDecision.toLowerCase() === replacementDecision.toLowerCase()
  ) {
    return null;
  }
  const replacementIsCurrent = uniqueStrings(next.decisions).some(
    (item) => item.toLowerCase() === replacementDecision.toLowerCase(),
  );
  if (!replacementIsCurrent) return null;
  if (
    decisionSupersessionSignature(previous.last_decision_supersession) ===
    decisionSupersessionSignature(marker)
  ) {
    return null;
  }
  return {
    previous: previousDecision,
    replacement: replacementDecision,
  };
}

async function retireMemoryByKey({ organization, scope, type, content, supersededBy = null }) {
  const clean = text(content, 1600);
  if (!clean) return;
  const now = new Date().toISOString();
  await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      superseded_by: supersededBy,
      superseded_at: now,
      updated_at: now,
    })
    .eq("organization_id", organization)
    .eq("memory_scope", scope)
    .eq("memory_key", memoryKey(type, clean))
    .eq("active", true);
}

async function retireCapabilityBlockers({ organization, scopes, capabilityKey }) {
  const key = text(capabilityKey, 300);
  if (!key) return;
  const now = new Date().toISOString();
  await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ active: false, superseded_at: now, updated_at: now })
    .eq("organization_id", organization)
    .eq("memory_type", "blocker")
    .eq("subject", key)
    .eq("active", true)
    .in("memory_scope", scopes);
}

export async function learnProjectStateMemories({
  organizationId,
  partyId = null,
  entityId = null,
  conversationId = null,
  previousProjectState = {},
  nextProjectState = {},
  source = "operator_project_state",
} = {}) {
  const organization = text(organizationId, 120);
  if (!organization) throw new Error("INTELLIGENCE_MEMORY_ORGANIZATION_REQUIRED");

  const previous = object(previousProjectState);
  const next = object(nextProjectState);
  const candidates = projectMemoryCandidates(previous, next);
  const partyScope = memoryScope({ partyId, scope: "party" });
  const decisionSupersession = productDecisionSupersession(previous, next);
  if (!candidates.length) {
    if (text(previous.blocker) && !text(next.blocker)) {
      await retireMemoryByKey({
        organization,
        scope: partyScope,
        type: "blocker",
        content: previous.blocker,
      }).catch((error) => console.error("INTELLIGENCE_MEMORY_BLOCKER_RETIRE_FAILED", error));
    }
    if (decisionSupersession) {
      await retireMemoryByKey({
        organization,
        scope: partyScope,
        type: "decision",
        content: decisionSupersession.previous,
      }).catch((error) => console.error("INTELLIGENCE_MEMORY_DECISION_SUPERSEDE_FAILED", error));
    }
    return { learned: 0 };
  }

  const now = new Date();
  const rows = candidates.map((item) => {
    const scope = item.scope === "party" && partyId
      ? memoryScope({ partyId, scope: "party" })
      : item.scope === "entity" && entityId
        ? memoryScope({ entityId, scope: "entity" })
        : "organization";
    const validUntil = item.ttlDays !== null
      ? new Date(now.getTime() + item.ttlDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    return {
      organization_id: organization,
      party_id: partyId || null,
      entity_id: entityId || null,
      conversation_id: conversationId || null,
      memory_scope: scope,
      memory_key: memoryKey(item.type, item.content),
      memory_type: item.type,
      subject: item.subject,
      content: item.content,
      importance: item.importance,
      confidence: item.confidence,
      source,
      active: true,
      valid_until: validUntil,
      superseded_by: null,
      superseded_at: null,
      forgotten_at: null,
      metadata: {
        learned_from: "verified_operator_state_delta",
        authorization_value: "none",
        raw_reasoning_persisted: false,
        mutable_business_fact_requires_live_read: item.type === "fact",
        ...item.metadata,
      },
      updated_at: now.toISOString(),
    };
  });

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_scope,memory_key,memory_type,subject");

  if (written.error) throw written.error;

  const writtenRows = list(written.data);

  if (text(previous.objective) && text(next.objective) && text(previous.objective) !== text(next.objective)) {
    const newGoalKey = memoryKey("goal", next.objective);
    const newGoal = writtenRows.find((row) => row.memory_key === newGoalKey);
    await retireMemoryByKey({
      organization,
      scope: partyScope,
      type: "goal",
      content: previous.objective,
      supersededBy: newGoal?.id || null,
    }).catch((error) => console.error("INTELLIGENCE_MEMORY_GOAL_SUPERSEDE_FAILED", error));
  }

  if (decisionSupersession) {
    const replacementKey = memoryKey(
      "decision",
      decisionSupersession.replacement,
    );
    const replacementMemory = writtenRows.find(
      (row) => row.memory_key === replacementKey,
    );
    await retireMemoryByKey({
      organization,
      scope: partyScope,
      type: "decision",
      content: decisionSupersession.previous,
      supersededBy: replacementMemory?.id || null,
    }).catch((error) => console.error("INTELLIGENCE_MEMORY_DECISION_SUPERSEDE_FAILED", error));
  }

  if (text(previous.blocker) && text(previous.blocker) !== text(next.blocker)) {
    await retireMemoryByKey({
      organization,
      scope: partyScope,
      type: "blocker",
      content: previous.blocker,
    }).catch((error) => console.error("INTELLIGENCE_MEMORY_BLOCKER_RETIRE_FAILED", error));
  }

  const execution = object(next.last_execution);
  const executionStatus = text(execution.status, 80).toLowerCase();
  if (executionStatus === "completed") {
    const scopes = ["organization"];
    if (partyId) scopes.push(partyScope);
    if (entityId) scopes.push(memoryScope({ entityId, scope: "entity" }));
    await retireCapabilityBlockers({
      organization,
      scopes,
      capabilityKey: capabilityKeyFromExecution(execution),
    }).catch((error) => console.error("INTELLIGENCE_MEMORY_EXECUTION_BLOCKER_RETIRE_FAILED", error));
  }

  return { learned: writtenRows.length };
}

export async function forgetIntelligenceMemory({ organizationId, memoryId } = {}) {
  const organization = text(organizationId, 120);
  const id = text(memoryId, 120);
  if (!organization) throw new Error("INTELLIGENCE_MEMORY_ORGANIZATION_REQUIRED");
  if (!id) throw new Error("INTELLIGENCE_MEMORY_ID_REQUIRED");

  const forgottenAt = new Date().toISOString();
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ active: false, forgotten_at: forgottenAt, updated_at: forgottenAt })
    .eq("organization_id", organization)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (result.error) throw result.error;
  return { forgotten: Boolean(result.data?.id), memory_id: result.data?.id || null };
}

export async function supersedeIntelligenceMemory({
  organizationId,
  oldMemoryId,
  newMemoryId,
} = {}) {
  const organization = text(organizationId, 120);
  const oldId = text(oldMemoryId, 120);
  const newId = text(newMemoryId, 120);
  if (!organization) throw new Error("INTELLIGENCE_MEMORY_ORGANIZATION_REQUIRED");
  if (!oldId || !newId || oldId === newId) throw new Error("INTELLIGENCE_MEMORY_SUPERSESSION_INVALID");

  const supersededAt = new Date().toISOString();
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      superseded_by: newId,
      superseded_at: supersededAt,
      updated_at: supersededAt,
    })
    .eq("organization_id", organization)
    .eq("id", oldId)
    .select("id")
    .maybeSingle();

  if (result.error) throw result.error;
  return {
    superseded: Boolean(result.data?.id),
    memory_id: result.data?.id || null,
    superseded_by: newId,
  };
}

export function boundedLongTermMemory(memories = []) {
  return list(memories).slice(0, MAX_RECALL).map((memory) => ({
    scope: text(memory.scope, 180),
    type: text(memory.type, 80),
    subject: text(memory.subject, 300) || null,
    content: text(memory.content, 1200),
    importance: Number(memory.importance || 0),
    confidence: Number(memory.confidence || 0),
    relevance: Number(memory.relevance || 0),
    valid_until: memory.valid_until || null,
    freshness: text(memory.freshness, 40) || null,
    requires_live_read: memory.requires_live_read === true,
    business_effect_verified: memory.business_effect_verified === true,
  }));
}
