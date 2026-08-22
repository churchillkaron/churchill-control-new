import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { extractExplicitDurableMemories } from "./IntelligenceExplicitMemoryPolicy";

const MEMORY_TABLE = "intelligence_memories";

function text(value, limit = 1600) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function memoryKey(type, content) {
  return `${type}:${createHash("sha256").update(text(content, 2000).toLowerCase()).digest("hex").slice(0, 24)}`;
}

function partyScope(partyId) {
  const party = text(partyId, 120);
  return party ? `party:${party}` : null;
}

async function loadRevisionCandidates({ organization, scope, revisionBases }) {
  if (!revisionBases.size) return [];

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,memory_type,metadata")
    .eq("organization_id", organization)
    .eq("memory_scope", scope)
    .eq("memory_type", "constraint")
    .eq("active", true)
    .limit(100);

  if (result.error) throw result.error;

  return (Array.isArray(result.data) ? result.data : []).filter((row) => {
    const metadata = object(row.metadata);
    return (
      metadata.learned_from === "explicit_user_statement" &&
      revisionBases.has(text(metadata.revision_basis, 500))
    );
  });
}

async function supersedeRevisedConstraints({
  organization,
  scope,
  candidates,
  existingRows,
  writtenRows,
}) {
  const now = new Date().toISOString();

  for (const candidate of candidates) {
    const revisionBasis = text(candidate.revision_basis, 500);
    if (!revisionBasis || candidate.type !== "constraint") continue;

    const newKey = memoryKey(candidate.type, candidate.content);
    const replacement = writtenRows.find((row) => row.memory_key === newKey);
    if (!replacement?.id) continue;

    const supersededIds = existingRows
      .filter((row) => {
        const metadata = object(row.metadata);
        return (
          row.id !== replacement.id &&
          row.memory_key !== newKey &&
          text(metadata.revision_basis, 500) === revisionBasis
        );
      })
      .map((row) => row.id)
      .filter(Boolean);

    if (!supersededIds.length) continue;

    const retired = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        active: false,
        superseded_by: replacement.id,
        superseded_at: now,
        updated_at: now,
      })
      .eq("organization_id", organization)
      .eq("memory_scope", scope)
      .in("id", supersededIds);

    if (retired.error) throw retired.error;
  }
}

export async function learnExplicitDurableMemories({
  organizationId,
  partyId,
  entityId = null,
  conversationId = null,
  message = "",
  source = "explicit_user_statement",
} = {}) {
  const organization = text(organizationId, 120);
  const scope = partyScope(partyId);
  if (!organization) throw new Error("INTELLIGENCE_MEMORY_ORGANIZATION_REQUIRED");
  if (!scope) throw new Error("INTELLIGENCE_MEMORY_PARTY_REQUIRED");

  const candidates = extractExplicitDurableMemories(message);
  if (!candidates.length) return { learned: 0, memories: [], superseded: 0 };

  const revisionBases = new Set(
    candidates
      .filter((item) => item.type === "constraint")
      .map((item) => text(item.revision_basis, 500))
      .filter(Boolean),
  );
  const existingRevisionRows = await loadRevisionCandidates({
    organization,
    scope,
    revisionBases,
  });

  const now = new Date().toISOString();
  const rows = candidates.map((item) => ({
    organization_id: organization,
    party_id: partyId,
    entity_id: entityId || null,
    conversation_id: conversationId || null,
    memory_scope: scope,
    memory_key: memoryKey(item.type, item.content),
    memory_type: item.type,
    subject: item.type === "constraint"
      ? "explicit_user_constraint"
      : "explicit_user_preference",
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
      learned_from: "explicit_user_statement",
      explicit_marker: item.marker,
      revision_basis: item.revision_basis || null,
      durability: "durable",
      authorization_value: "none",
      raw_reasoning_persisted: false,
      mutable_business_fact_requires_live_read: false,
    },
    updated_at: now,
  }));

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_key,memory_type,content,memory_scope");

  if (written.error) throw written.error;

  const writtenRows = Array.isArray(written.data) ? written.data : [];
  await supersedeRevisedConstraints({
    organization,
    scope,
    candidates,
    existingRows: existingRevisionRows,
    writtenRows,
  });

  const writtenIds = new Set(writtenRows.map((row) => row.id).filter(Boolean));
  const superseded = existingRevisionRows.filter((row) => !writtenIds.has(row.id)).length;

  return {
    learned: writtenRows.length,
    memories: writtenRows,
    superseded,
  };
}
