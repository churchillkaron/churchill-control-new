import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function boundedTurns(rows = []) {
  return (rows || [])
    .slice()
    .reverse()
    .map((row) => ({
      role: row.role === "assistant" ? "assistant" : "user",
      content: text(row.content),
    }))
    .filter((row) => row.content);
}

export async function loadOrCreateIntelligenceConversation({
  organizationId,
  partyId,
  entityId = null,
  periodId = null,
  userId = null,
  conversationKey = "primary",
} = {}) {
  if (!organizationId) throw new Error("INTELLIGENCE_ORGANIZATION_REQUIRED");
  if (!partyId) throw new Error("INTELLIGENCE_PARTY_REQUIRED");

  const key = text(conversationKey) || "primary";

  const existing = await supabaseAdmin
    .from("intelligence_conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .eq("conversation_key", key)
    .maybeSingle();

  if (existing.error) throw existing.error;

  let conversation = existing.data || null;

  if (!conversation) {
    const created = await supabaseAdmin
      .from("intelligence_conversations")
      .insert({
        organization_id: organizationId,
        party_id: partyId,
        entity_id: entityId,
        period_id: periodId,
        conversation_key: key,
        status: "ACTIVE",
        agreement_state: {},
        project_state: {},
        created_by_user_id: userId,
      })
      .select("*")
      .single();

    if (created.error) throw created.error;
    conversation = created.data;
  } else if (
    conversation.entity_id !== entityId ||
    conversation.period_id !== periodId
  ) {
    const updated = await supabaseAdmin
      .from("intelligence_conversations")
      .update({
        entity_id: entityId,
        period_id: periodId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (updated.error) throw updated.error;
    conversation = updated.data;
  }

  const turns = await supabaseAdmin
    .from("intelligence_turns")
    .select("role, content, created_at")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(24);

  if (turns.error) throw turns.error;

  return {
    conversation,
    recentConversation: boundedTurns(turns.data),
    agreementState: object(conversation.agreement_state),
    projectState: object(conversation.project_state),
  };
}

export async function persistIntelligenceTurn({
  organizationId,
  conversationId,
  partyId,
  role,
  source = "text",
  content,
  decision = {},
  evidence = {},
  execution = {},
  navigation = {},
} = {}) {
  if (!organizationId || !conversationId || !partyId) {
    throw new Error("INTELLIGENCE_TURN_SCOPE_REQUIRED");
  }

  const normalizedRole = text(role).toLowerCase();
  if (!["user", "assistant", "system"].includes(normalizedRole)) {
    throw new Error("INTELLIGENCE_TURN_ROLE_INVALID");
  }

  const normalizedContent = text(content);
  if (!normalizedContent) throw new Error("INTELLIGENCE_TURN_CONTENT_REQUIRED");

  const inserted = await supabaseAdmin
    .from("intelligence_turns")
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      party_id: partyId,
      role: normalizedRole,
      source: text(source) || "text",
      content: normalizedContent,
      decision: object(decision),
      evidence: object(evidence),
      execution: object(execution),
      navigation: object(navigation),
    })
    .select("id, created_at")
    .single();

  if (inserted.error) throw inserted.error;
  return inserted.data;
}

export async function updateIntelligenceConversationState({
  organizationId,
  conversationId,
  agreementState = {},
  projectState = {},
  title = null,
} = {}) {
  if (!organizationId || !conversationId) {
    throw new Error("INTELLIGENCE_CONVERSATION_SCOPE_REQUIRED");
  }

  const now = new Date().toISOString();
  const updated = await supabaseAdmin
    .from("intelligence_conversations")
    .update({
      agreement_state: object(agreementState),
      project_state: object(projectState),
      ...(text(title) ? { title: text(title) } : {}),
      last_message_at: now,
      updated_at: now,
    })
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .select("*")
    .single();

  if (updated.error) throw updated.error;
  return updated.data;
}

export async function persistAssistantTurnAndConversationState({
  organizationId,
  conversationId,
  partyId,
  source = "text",
  content,
  decision = {},
  evidence = {},
  execution = {},
  navigation = {},
  agreementState = {},
  projectState = {},
  title = null,
} = {}) {
  if (!organizationId || !conversationId || !partyId) {
    throw new Error("INTELLIGENCE_CONVERSATION_SCOPE_REQUIRED");
  }

  const normalizedContent = text(content);
  if (!normalizedContent) throw new Error("INTELLIGENCE_TURN_CONTENT_REQUIRED");

  const persisted = await supabaseAdmin.rpc(
    "persist_intelligence_assistant_turn",
    {
      p_organization_id: organizationId,
      p_conversation_id: conversationId,
      p_party_id: partyId,
      p_source: text(source) || "text",
      p_content: normalizedContent,
      p_decision: object(decision),
      p_evidence: object(evidence),
      p_execution: object(execution),
      p_navigation: object(navigation),
      p_agreement_state: object(agreementState),
      p_project_state: object(projectState),
      p_title: text(title) || null,
    },
  );

  if (persisted.error) throw persisted.error;

  const data = object(persisted.data);
  return {
    conversation: object(data.conversation),
    turn: object(data.turn),
  };
}

export async function loadIntelligenceConversationSnapshot({
  organizationId,
  partyId,
  conversationKey = "primary",
} = {}) {
  if (!organizationId || !partyId) {
    throw new Error("INTELLIGENCE_CONVERSATION_SCOPE_REQUIRED");
  }

  const key = text(conversationKey) || "primary";
  const conversation = await supabaseAdmin
    .from("intelligence_conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .eq("conversation_key", key)
    .maybeSingle();

  if (conversation.error) throw conversation.error;
  if (!conversation.data) return null;

  const turns = await supabaseAdmin
    .from("intelligence_turns")
    .select("id, role, source, content, decision, created_at")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversation.data.id)
    .order("created_at", { ascending: true })
    .limit(100);

  if (turns.error) throw turns.error;

  return {
    conversation: conversation.data,
    turns: turns.data || [],
  };
}
