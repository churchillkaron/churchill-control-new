import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { extractExplicitDurableMemories } from "./IntelligenceExplicitMemoryPolicy";

const MEMORY_TABLE = "intelligence_memories";

function text(value, limit = 1600) {
  return String(value ?? "").trim().slice(0, limit);
}

function memoryKey(type, content) {
  return `${type}:${createHash("sha256").update(text(content, 2000).toLowerCase()).digest("hex").slice(0, 24)}`;
}

function partyScope(partyId) {
  const party = text(partyId, 120);
  return party ? `party:${party}` : null;
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
  if (!candidates.length) return { learned: 0, memories: [] };

  const now = new Date().toISOString();
  const rows = candidates.map((item) => ({
    organization_id: organization,
    party_id: partyId,
    entity_id: entityId || null,
    conversation_id: conversationId || null,
    memory_scope: scope,
    memory_key: memoryKey(item.type, item.content),
    memory_type: item.type,
    subject: "explicit_user_instruction",
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
    .select("id,memory_type,content,memory_scope");

  if (written.error) throw written.error;

  return {
    learned: Array.isArray(written.data) ? written.data.length : 0,
    memories: Array.isArray(written.data) ? written.data : [],
  };
}
