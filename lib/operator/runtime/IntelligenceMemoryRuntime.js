import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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

function normalizeMemory(row) {
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
  };
}

function isRecallable(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  if (row?.forgotten_at || row?.superseded_at || row?.superseded_by) return false;
  if (!row?.valid_until) return true;
  const expiry = Date.parse(row.valid_until);
  return !Number.isFinite(expiry) || expiry > nowMs;
}

function relevance(row, queryTokens) {
  const haystack = `${text(row.subject)} ${text(row.content)}`.toLowerCase();
  let lexical = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) lexical += 1;
  }
  lexical = queryTokens.length ? lexical / Math.min(queryTokens.length, 12) : 0;
  const importance = Math.max(0, Math.min(1, Number(row.importance || 0)));
  const confidence = Math.max(0, Math.min(1, Number(row.confidence || 0)));
  const ageMs = Date.now() - new Date(row.updated_at || row.created_at || 0).getTime();
  const recency = Number.isFinite(ageMs)
    ? Math.max(0, 1 - ageMs / (180 * 24 * 60 * 60 * 1000))
    : 0;
  return lexical * 0.58 + importance * 0.24 + confidence * 0.1 + recency * 0.08;
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
    .select("id,memory_scope,memory_type,subject,content,importance,confidence,active,recall_count,valid_until,superseded_by,superseded_at,forgotten_at,updated_at,created_at")
    .eq("organization_id", organization)
    .eq("active", true)
    .in("memory_scope", scopes)
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(80);

  if (result.error) throw result.error;

  const selected = list(result.data)
    .filter((row) => isRecallable(row))
    .map((row) => ({ row, score: relevance(row, queryTokens) }))
    .filter((entry) => entry.score >= 0.12 || Number(entry.row.importance || 0) >= 0.8)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(MAX_RECALL, Number(limit) || MAX_RECALL)));

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
    ...normalizeMemory(entry.row),
    relevance: Number(entry.score.toFixed(4)),
  }));
}

function candidate(type, content, { subject = null, importance = 0.7, confidence = 1, scope = "organization" } = {}) {
  const clean = text(content, 1600);
  if (!clean || !MEMORY_TYPES.has(type)) return null;
  return { type, content: clean, subject: text(subject, 300) || null, importance, confidence, scope };
}

function projectMemoryCandidates(previousState = {}, nextState = {}) {
  const previous = object(previousState);
  const next = object(nextState);
  const output = [];

  if (text(next.objective) && text(next.objective) !== text(previous.objective)) {
    output.push(candidate("goal", next.objective, { importance: 0.95 }));
  }

  const previousDecisions = new Set(uniqueStrings(previous.decisions).map((item) => item.toLowerCase()));
  for (const item of uniqueStrings(next.decisions)) {
    if (!previousDecisions.has(item.toLowerCase())) {
      output.push(candidate("decision", item, { importance: 0.95 }));
    }
  }

  const previousConstraints = new Set(uniqueStrings(previous.constraints).map((item) => item.toLowerCase()));
  for (const item of uniqueStrings(next.constraints)) {
    if (!previousConstraints.has(item.toLowerCase())) {
      output.push(candidate("constraint", item, { importance: 0.9 }));
    }
  }

  const previousSteps = new Set(uniqueStrings(previous.completed_steps).map((item) => item.toLowerCase()));
  for (const item of uniqueStrings(next.completed_steps)) {
    if (!previousSteps.has(item.toLowerCase())) {
      output.push(candidate("completed_step", item, { importance: 0.72 }));
    }
  }

  if (text(next.blocker) && text(next.blocker) !== text(previous.blocker)) {
    output.push(candidate("blocker", next.blocker, { importance: 0.82 }));
  }

  return output.filter(Boolean);
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

  const candidates = projectMemoryCandidates(previousProjectState, nextProjectState);
  if (!candidates.length) return { learned: 0 };

  const rows = candidates.map((item) => {
    const scope = item.scope === "party" && partyId
      ? memoryScope({ partyId, scope: "party" })
      : item.scope === "entity" && entityId
        ? memoryScope({ entityId, scope: "entity" })
        : "organization";
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
      valid_until: null,
      superseded_by: null,
      superseded_at: null,
      forgotten_at: null,
      metadata: {
        learned_from: "verified_operator_state_delta",
        authorization_value: "none",
        raw_reasoning_persisted: false,
      },
      updated_at: new Date().toISOString(),
    };
  });

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id");

  if (written.error) throw written.error;
  return { learned: list(written.data).length };
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
    valid_until: memory.valid_until || null,
  }));
}