import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MEMORY_TABLE = "intelligence_memories";
const TURN_TABLE = "intelligence_turns";
const MIN_OCCURRENCES = 2;
const MAX_RECENT_TURNS = 160;
const LESSON_TTL_DAYS = 120;

function text(value, limit = 1600) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value : []; }
function partyScope(partyId) {
  const party = text(partyId, 120);
  return party ? `party:${party}` : null;
}
function memoryKey(signal) {
  return `lesson:${createHash("sha256").update(`conversation:${signal}`).digest("hex").slice(0, 24)}`;
}

const SIGNALS = Object.freeze({
  semantic_correction: {
    min_occurrences: 2, min_conversations: 1,
    subject: "conversation.semantic_correction",
    content: "The user has repeatedly corrected or revised an interpretation. Treat the current message as authoritative, preserve only context the user still refers to, and verify the revised meaning before continuing material work.",
    importance: 0.86,
  },
  recommendation_rejected: {
    min_occurrences: 2, min_conversations: 1,
    subject: "conversation.recommendation_rejected",
    content: "The user has repeatedly rejected a proposed recommendation. Improve the next recommendation by testing a stronger alternative, exposing the key uncertainty, and grounding the choice in current evidence instead of repeating the same direction.",
    importance: 0.82,
  },
  recommendation_selected: {
    min_occurrences: 4, min_conversations: 1,
    subject: "conversation.recommendation_selected",
    content: "The user has repeatedly selected Business Partner recommendations. Continue to be proactive, but keep recommendation, selection, and execution authority separate and preserve the evidence behind the recommendation.",
    importance: 0.78,
  },
  clarification_required: {
    min_occurrences: 3, min_conversations: 1,
    subject: "conversation.clarification_required",
    content: "Material ambiguity has repeatedly required clarification. Prefer resolving references from recent context first, then ask one focused natural-language question only when the ambiguity remains materially important.",
    importance: 0.76,
  },
  artifact_reused: {
    min_occurrences: 2, min_conversations: 1,
    subject: "conversation.artifact_reuse",
    content: "The user repeatedly reuses existing artifacts. Preserve recent artifact continuity and prefer presenting the exact existing artifact when requested instead of recreating or mutating business state.",
    importance: 0.8,
  },
  response_detail_deep: {
    min_occurrences: 5, min_conversations: 1,
    subject: "conversation.response_detail_deep",
    content: "The user repeatedly prefers deeper reasoning and fuller analysis. When the current request permits it, provide more complete reasoning, alternatives, evidence and next-step guidance without waiting to be asked for every implication.",
    importance: 0.72,
  },
  response_detail_brief: {
    min_occurrences: 5, min_conversations: 1,
    subject: "conversation.response_detail_brief",
    content: "The user repeatedly prefers concise interactive replies. Keep normal progress and answers compact, surface the key decision and next step first, and expand only when the task or user request needs depth.",
    importance: 0.72,
  },
  context_expanded: {
    min_occurrences: 5, min_conversations: 1,
    subject: "conversation.context_expanded",
    content: "The user repeatedly benefits from broader continuity context. Preserve relevant cross-turn context and implications when answering, while still letting the current message override unrelated prior work.",
    importance: 0.7,
  },
});

function safeCapabilityKey(value) {
  const key = text(value, 300);
  return /^[A-Za-z0-9_.:-]{3,300}$/.test(key) ? key : null;
}

function activeSignals(evidence = {}) {
  const signals = object(object(evidence).learning_signals);
  const active = Object.keys(SIGNALS).filter((key) => signals[key] === true);
  const capabilityKey = safeCapabilityKey(signals.recommendation_capability_key);
  if (capabilityKey && signals.recommendation_selected === true) {
    active.push(`recommendation_selected:${capabilityKey}`);
  }
  if (capabilityKey && signals.recommendation_rejected === true) {
    active.push(`recommendation_rejected:${capabilityKey}`);
  }
  return active;
}

function signalSpec(signal) {
  if (SIGNALS[signal]) return SIGNALS[signal];
  const [kind, ...parts] = String(signal).split(":");
  const capabilityKey = safeCapabilityKey(parts.join(":"));
  if (!capabilityKey || !["recommendation_selected", "recommendation_rejected"].includes(kind)) return null;
  const selected = kind === "recommendation_selected";
  return {
    min_occurrences: selected ? 3 : 2,
    min_conversations: 1,
    subject: `conversation.${kind}.${capabilityKey}`.slice(0, 300),
    content: selected
      ? `The user has repeatedly selected recommendations in the registered capability family ${capabilityKey}. Treat that as advisory evidence that proactive recommendations in this family can be useful, while still comparing alternatives, using current evidence, and keeping selection separate from execution authority.`
      : `The user has repeatedly rejected recommendations in the registered capability family ${capabilityKey}. Before proposing this family again, strengthen the evidence, test a materially different alternative, and explain the uncertainty instead of repeating the same recommendation pattern.`,
    importance: selected ? 0.76 : 0.84,
    capability_key: capabilityKey,
  };
}

function evidenceHasSignal(row, signal) {
  const signals = object(object(row?.evidence).learning_signals);
  if (SIGNALS[signal]) return signals[signal] === true;
  const [kind, ...parts] = String(signal).split(":");
  const capabilityKey = safeCapabilityKey(parts.join(":"));
  return Boolean(
    capabilityKey &&
    signals[kind] === true &&
    safeCapabilityKey(signals.recommendation_capability_key) === capabilityKey
  );
}

export async function learnAdaptiveConversationLesson({
  organizationId,
  partyId,
  conversationId,
  evidence = {},
} = {}) {
  const organization = text(organizationId, 120);
  const scope = partyScope(partyId);
  const conversation = text(conversationId, 120);
  if (!organization || !scope || !conversation) {
    throw new Error("ADAPTIVE_CONVERSATION_LEARNING_SCOPE_REQUIRED");
  }
  const signals = activeSignals(evidence);
  if (!signals.length) return { learned: 0, observations: 0 };

  const recent = await supabaseAdmin
    .from(TURN_TABLE)
    .select("evidence,conversation_id,created_at")
    .eq("organization_id", organization)
    .eq("party_id", partyId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(MAX_RECENT_TURNS);
  if (recent.error) throw recent.error;

  const now = new Date();
  const rows = [];
  for (const signal of signals) {
    const matches = list(recent.data).filter((row) => evidenceHasSignal(row, signal));
    const occurrenceCount = matches.length;
    const conversationCount = new Set(matches.map((row) => text(row?.conversation_id, 120)).filter(Boolean)).size;
    const spec = signalSpec(signal);
    if (!spec) continue;
    const minimumOccurrences = Math.max(MIN_OCCURRENCES, Number(spec.min_occurrences || MIN_OCCURRENCES));
    const minimumConversations = Math.max(1, Number(spec.min_conversations || 1));
    if (occurrenceCount < minimumOccurrences || conversationCount < minimumConversations) continue;
    const confidence = Math.min(0.94, 0.66 + Math.min(6, occurrenceCount) * 0.045 + Math.min(3, conversationCount) * 0.03);
    rows.push({
      organization_id: organization,
      party_id: partyId,
      entity_id: null,
      conversation_id: conversation,
      memory_scope: scope,
      memory_key: memoryKey(signal),
      memory_type: "lesson",
      subject: spec.subject,
      content: spec.content,
      importance: spec.importance,
      confidence,
      source: "adaptive_conversation_learning",
      active: true,
      valid_until: new Date(now.getTime() + LESSON_TTL_DAYS * 86400000).toISOString(),
      superseded_by: null,
      superseded_at: null,
      forgotten_at: null,
      metadata: {
        learned_from: "repeated_semantic_conversation_signal",
        signal,
        recommendation_capability_key: spec.capability_key || null,
        observed_in_recent_turns: occurrenceCount,
        observed_across_conversations: conversationCount,
        learning_scope: "party_across_conversations",
        advisory_only: true,
        explicit_current_instruction_overrides: true,
        authorization_value: "none",
        raw_user_text_persisted: false,
        raw_assistant_text_persisted: false,
        raw_reasoning_persisted: false,
      },
      updated_at: now.toISOString(),
    });
  }
  if (!rows.length) return { learned: 0, observations: signals.length };
  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_key,memory_type,subject,confidence,valid_until");
  if (written.error) throw written.error;
  return { learned: list(written.data).length, observations: signals.length, memories: list(written.data) };
}

export const AdaptiveConversationLearningRuntime = Object.freeze({
  learn: learnAdaptiveConversationLesson,
});

export default AdaptiveConversationLearningRuntime;
