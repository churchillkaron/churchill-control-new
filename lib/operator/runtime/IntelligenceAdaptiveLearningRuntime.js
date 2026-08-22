import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  deriveAdaptiveFailureLearning,
  observeVerifiedExecutionFailure,
} from "./IntelligenceFailureLearningPolicy";

const MEMORY_TABLE = "intelligence_memories";

function text(value, limit = 1600) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function memoryKey(type, content) {
  return `${type}:${createHash("sha256")
    .update(text(content, 2000).toLowerCase())
    .digest("hex")
    .slice(0, 24)}`;
}

function partyScope(partyId) {
  const party = text(partyId, 120);
  return party ? `party:${party}` : null;
}

export async function learnAdaptiveExecutionLesson({
  organizationId,
  partyId,
  entityId = null,
  conversationId,
  execution = {},
} = {}) {
  const organization = text(organizationId, 120);
  const scope = partyScope(partyId);
  const conversation = text(conversationId, 120);
  if (!organization) throw new Error("INTELLIGENCE_MEMORY_ORGANIZATION_REQUIRED");
  if (!scope) throw new Error("INTELLIGENCE_MEMORY_PARTY_REQUIRED");
  if (!conversation) throw new Error("INTELLIGENCE_MEMORY_CONVERSATION_REQUIRED");

  const observation = observeVerifiedExecutionFailure(execution);
  if (!observation) return { learned: 0, occurrence_count: 0 };

  const recent = await supabaseAdmin
    .from("intelligence_turns")
    .select("execution,created_at")
    .eq("organization_id", organization)
    .eq("conversation_id", conversation)
    .eq("party_id", partyId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(60);

  if (recent.error) throw recent.error;

  const matching = list(recent.data)
    .map((row) => observeVerifiedExecutionFailure(row?.execution))
    .filter((item) => item?.fingerprint === observation.fingerprint);

  const occurrenceCount = matching.length;
  if (occurrenceCount < 2) {
    return {
      learned: 0,
      occurrence_count: occurrenceCount,
      fingerprint: observation.fingerprint,
    };
  }

  const learning = deriveAdaptiveFailureLearning({
    observation,
    existingMetadata: {
      failure_occurrence_count: occurrenceCount - 1,
    },
  });
  const lesson = learning?.lesson;
  if (!lesson) {
    return {
      learned: 0,
      occurrence_count: occurrenceCount,
      fingerprint: observation.fingerprint,
    };
  }

  const now = new Date().toISOString();
  const row = {
    organization_id: organization,
    party_id: partyId,
    entity_id: entityId || null,
    conversation_id: conversation,
    memory_scope: scope,
    memory_key: memoryKey(lesson.type, lesson.content),
    memory_type: lesson.type,
    subject: lesson.subject,
    content: lesson.content,
    importance: lesson.importance,
    confidence: lesson.confidence,
    source: "adaptive_execution_learning",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      ...lesson.metadata,
      observed_in_recent_turns: occurrenceCount,
      authorization_value: "none",
      raw_reasoning_persisted: false,
      mutable_business_fact_requires_live_read: false,
    },
    updated_at: now,
  };

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_type,subject,content,memory_scope,metadata")
    .single();

  if (written.error) throw written.error;

  return {
    learned: written.data?.id ? 1 : 0,
    occurrence_count: occurrenceCount,
    fingerprint: observation.fingerprint,
    memory: written.data || null,
  };
}
