import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { learnExplicitDurableMemories } from "./IntelligenceExplicitMemoryRuntime";
import { learnAdaptiveExecutionLesson } from "./IntelligenceAdaptiveLearningRuntime";

const AUTHORIZATION_MODES = new Set([
  "read",
  "auto_execute",
  "user_confirmed",
  "approval_resumed",
  "mission_governed",
  "unresolved",
]);
const AUTHORIZATION_REQUIREMENTS = new Set([
  "none",
  "user_confirmation",
  "durable_approval",
  "verification",
  "mission_gate",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizedAuthorizationMode(value) {
  const mode = text(value).toLowerCase();
  return AUTHORIZATION_MODES.has(mode) ? mode : null;
}

function normalizedAuthorizationRequirement(value) {
  const requirement = text(value).toLowerCase();
  return AUTHORIZATION_REQUIREMENTS.has(requirement) ? requirement : null;
}

function samePendingCapability(previousPending, pending) {
  return Boolean(
    text(previousPending?.capability_key) &&
      text(previousPending?.capability_key) === text(pending?.capability_key),
  );
}

function autonomousRunStatus(agreementState = {}) {
  return text(agreementState?.autonomous_run?.status).toLowerCase();
}

function pendingRequirement({ pending, agreementState }) {
  const resumeKind = text(pending?.resume_kind).toLowerCase();
  if (resumeKind === "verification") return "verification";

  const status = autonomousRunStatus(agreementState);
  if (status === "awaiting_confirmation") return "user_confirmation";
  if (status === "awaiting_approval") return "durable_approval";
  if (status === "verifying") return "verification";
  if (resumeKind === "mission") return "mission_gate";
  return "none";
}

function priorPendingAuthorization(previousAgreementState, pending) {
  const previousPending = object(previousAgreementState?.pending_execution);
  if (!samePendingCapability(previousPending, pending)) {
    return {
      pending: previousPending,
      mode: null,
      originMode: null,
      requirement: null,
      parentOriginMode: null,
    };
  }

  return {
    pending: previousPending,
    mode: normalizedAuthorizationMode(previousPending.authorization_mode),
    originMode: normalizedAuthorizationMode(
      previousPending.authorization_origin_mode,
    ),
    requirement: normalizedAuthorizationRequirement(
      previousPending.authorization_requirement,
    ),
    parentOriginMode: normalizedAuthorizationMode(
      previousPending.parent_authorization_origin_mode,
    ),
  };
}

function sourceOriginMode(source, previousStateAvailable) {
  if (!previousStateAvailable) return "unresolved";
  return text(source).toLowerCase() === "voice"
    ? "unresolved"
    : "auto_execute";
}

function pendingAuthorizationState({
  agreementState,
  previousAgreementState,
  execution,
  source,
  previousStateAvailable = true,
}) {
  const next = object(agreementState);
  const pending = object(next.pending_execution);
  if (!text(pending.capability_key)) return next;

  const previous = priorPendingAuthorization(previousAgreementState, pending);
  const requirement = pendingRequirement({ pending, agreementState: next });
  const resumeKind = text(pending.resume_kind).toLowerCase();
  const executionReason = text(execution?.reason).toUpperCase();
  const confirmationGate = [
    "VOICE_CONFIRMATION_REQUIRED",
    "CONFIRMATION_REQUIRED",
  ].includes(executionReason);
  const approvalGate =
    requirement === "durable_approval" ||
    Boolean(text(pending.approval_request_id)) ||
    executionReason.startsWith("APPROVAL_");

  let mode = previous.mode;
  let originMode = previous.originMode || previous.mode;
  let parentOriginMode = previous.parentOriginMode;

  if (resumeKind === "verification") {
    const priorWasConfirmation = previous.requirement === "user_confirmation";
    parentOriginMode =
      parentOriginMode ||
      (priorWasConfirmation ? "user_confirmed" : previous.originMode || previous.mode);
    mode = "read";
    originMode = "read";
  } else if (resumeKind === "mission") {
    const previousConfirmedMissionStart =
      previous.requirement === "user_confirmation" &&
      text(previous.pending?.resume_kind).toLowerCase() !== "mission";

    if (previousConfirmedMissionStart) {
      mode = "user_confirmed";
      originMode = "user_confirmed";
    } else if (!originMode) {
      mode = sourceOriginMode(source, previousStateAvailable);
      originMode = mode;
    }
  } else if (confirmationGate || requirement === "user_confirmation") {
    mode = null;
    originMode = null;
  } else if (approvalGate) {
    if (previous.requirement === "user_confirmation") {
      mode = "user_confirmed";
      originMode = "user_confirmed";
    } else if (!originMode) {
      if (!previousStateAvailable || text(source).toLowerCase() === "voice") {
        mode = "unresolved";
        originMode = "unresolved";
      } else {
        mode = "auto_execute";
        originMode = "auto_execute";
      }
    }
  } else if (!originMode && previous.requirement === "user_confirmation") {
    mode = "user_confirmed";
    originMode = "user_confirmed";
  }

  return {
    ...next,
    pending_execution: {
      ...pending,
      authorization_requirement: requirement,
      authorization_mode: mode,
      authorization_origin_mode: originMode,
      authorization_server_authoritative: true,
      ...(parentOriginMode
        ? { parent_authorization_origin_mode: parentOriginMode }
        : {}),
    },
  };
}

async function loadPersistedAgreementState({ organizationId, conversationId }) {
  const current = await supabaseAdmin
    .from("intelligence_conversations")
    .select("agreement_state")
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .maybeSingle();

  if (current.error) {
    console.error("OPERATOR_PREVIOUS_AGREEMENT_STATE_LOAD_FAILED", {
      organizationId,
      conversationId,
      error: current.error.message || current.error,
    });
    return { agreementState: {}, available: false };
  }
  return {
    agreementState: object(current.data?.agreement_state),
    available: true,
  };
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
  const memory = await supabaseAdmin.rpc(
    "load_or_create_intelligence_conversation_memory",
    {
      p_organization_id: organizationId,
      p_party_id: partyId,
      p_entity_id: entityId,
      p_period_id: periodId,
      p_user_id: userId,
      p_conversation_key: key,
    },
  );

  if (memory.error) throw memory.error;

  const data = object(memory.data);
  const conversation = object(data.conversation);
  if (!conversation.id) {
    throw new Error("INTELLIGENCE_CONVERSATION_LOAD_FAILED");
  }
  const turns = Array.isArray(data.turns) ? data.turns : [];

  return {
    conversation,
    recentConversation: boundedTurns(turns),
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

  if (normalizedRole === "user") {
    await learnExplicitDurableMemories({
      organizationId,
      partyId,
      conversationId,
      message: normalizedContent,
      source: "persisted_user_turn",
    }).catch((error) => {
      console.error("INTELLIGENCE_EXPLICIT_MEMORY_LEARN_FAILED", {
        organizationId,
        conversationId,
        error: error?.message || String(error),
      });
    });
  }

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

  const previousState = await loadPersistedAgreementState({
    organizationId,
    conversationId,
  });
  const persistedAgreementState = pendingAuthorizationState({
    agreementState,
    previousAgreementState: previousState.agreementState,
    execution: object(execution),
    source,
    previousStateAvailable: previousState.available,
  });

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
      p_agreement_state: persistedAgreementState,
      p_project_state: object(projectState),
      p_title: text(title) || null,
    },
  );

  if (persisted.error) throw persisted.error;

  await learnAdaptiveExecutionLesson({
    organizationId,
    partyId,
    conversationId,
    execution: object(execution),
  }).catch((error) => {
    console.error("INTELLIGENCE_ADAPTIVE_LESSON_LEARN_FAILED", {
      organizationId,
      conversationId,
      error: error?.message || String(error),
    });
  });

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
