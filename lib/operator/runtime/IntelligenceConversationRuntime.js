import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { verifyBusinessDiagnosisAuditProjection } from "@/lib/intelligence/runtime/AvantiqoBusinessDiagnosisReceiptRuntime";
import { sanitizeBusinessDiagnosisConversation, sanitizeBusinessDiagnosisSnapshot } from "./BusinessDiagnosisConversationSanitizerRuntime";
import { learnExplicitDurableMemories } from "./IntelligenceExplicitMemoryRuntime";
import {
  learnAdaptiveExecutionLesson,
  retireAdaptiveLessonsAfterVerifiedSuccess,
} from "./IntelligenceAdaptiveLearningRuntime";
import {
  recordAvantiqoVerifiedExecutionOutcome,
} from "@/lib/intelligence/runtime/AvantiqoVerifiedOutcomeLearningRuntime";
import {
  recordAvantiqoKnowledgeUtilityObservation,
} from "@/lib/intelligence/runtime/AvantiqoKnowledgeUtilityAttributionRuntime";
import {
  recordAvantiqoBusinessPartnerExperience,
} from "@/lib/intelligence/runtime/AvantiqoBusinessPartnerExperienceRuntime";

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


function diagnosisVerificationUserTurnIds(rows = []) {
  const ids = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const evidence = object(row?.evidence);
    const diagnosisUserTurnId = text(evidence?.business_diagnosis?.scope_user_turn_id);
    const failureUserTurnId = text(evidence?.diagnosis_failure_pair?.user_turn_id);
    if (diagnosisUserTurnId) ids.add(diagnosisUserTurnId);
    if (failureUserTurnId) ids.add(failureUserTurnId);
  }
  return [...ids];
}

async function loadMissingDiagnosisVerificationUserTurns({ organizationId, conversationId, rows = [] } = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const presentIds = new Set(sourceRows.map((row) => text(row?.id)).filter(Boolean));
  const missingIds = diagnosisVerificationUserTurnIds(sourceRows).filter((id) => !presentIds.has(id));
  if (!missingIds.length) return [];
  const support = await supabaseAdmin
    .from("intelligence_turns")
    .select("id,role,content,evidence,created_at")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .eq("role", "user")
    .in("id", missingIds.slice(0, 24));
  if (support.error) {
    console.error("OPERATOR_DIAGNOSIS_VERIFICATION_SUPPORT_LOAD_FAILED", {
      organizationId,
      conversationId,
      requested: missingIds.length,
      error: support.error.message || support.error,
    });
    return [];
  }
  return support.data || [];
}

async function loadVerifiedRecentConversationTurns({ organizationId, conversationId, entityId = null, periodId = null } = {}) {
  const turns = await supabaseAdmin
    .from("intelligence_turns")
    .select("id,role,content,evidence,created_at")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(24);
  if (turns.error) {
    console.error("OPERATOR_VERIFIED_RECENT_CONVERSATION_LOAD_FAILED", {
      organizationId,
      conversationId,
      error: turns.error.message || turns.error,
    });
    return [];
  }
  const supportRows = await loadMissingDiagnosisVerificationUserTurns({
    organizationId,
    conversationId,
    rows: turns.data || [],
  });
  return sanitizeBusinessDiagnosisConversation(turns.data || [], {
    organization_id: organizationId,
    conversation_id: conversationId,
    entity_id: entityId,
    period_id: periodId,
    require_period_context: true,
  }, supportRows);
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
  const recentConversation = await loadVerifiedRecentConversationTurns({
    organizationId,
    conversationId: conversation.id,
    entityId: conversation.entity_id,
    periodId: conversation.period_id,
  });

  return {
    conversation,
    recentConversation,
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

export async function findPersistedAssistantContinuationTurn({
  organizationId,
  conversationId,
  partyId,
  idempotencyKey,
} = {}) {
  const key = text(idempotencyKey, 300);
  if (!organizationId || !conversationId || !partyId || !key) return null;
  const result = await supabaseAdmin
    .from("intelligence_turns")
    .select("id,created_at,decision,execution")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .eq("party_id", partyId)
    .eq("role", "assistant")
    .eq("source", "event")
    .contains("decision", { continuation_idempotency_key: key })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
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
  continuationIdempotencyKey = null,
} = {}) {
  if (!organizationId || !conversationId || !partyId) {
    throw new Error("INTELLIGENCE_CONVERSATION_SCOPE_REQUIRED");
  }

  const normalizedContent = text(content);
  if (!normalizedContent) throw new Error("INTELLIGENCE_TURN_CONTENT_REQUIRED");
  const continuationKey = text(continuationIdempotencyKey, 300);
  if (text(source).toLowerCase() === "event" && continuationKey) {
    const existing = await findPersistedAssistantContinuationTurn({
      organizationId, conversationId, partyId, idempotencyKey: continuationKey,
    });
    if (existing) {
      return { conversation: {}, turn: object(existing), duplicate: true };
    }
  }

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
      p_decision: continuationKey
        ? { ...object(decision), continuation_idempotency_key: continuationKey }
        : object(decision),
      p_evidence: object(evidence),
      p_execution: object(execution),
      p_navigation: object(navigation),
      p_agreement_state: persistedAgreementState,
      p_project_state: object(projectState),
      p_title: text(title) || null,
    },
  );

  if (persisted.error) throw persisted.error;

  const data = object(persisted.data);
  const persistedTurnId = text(data.turn?.id, 160) || null;

  await Promise.all([
    learnAdaptiveExecutionLesson({
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
    }),
    retireAdaptiveLessonsAfterVerifiedSuccess({
      organizationId,
      partyId,
      execution: object(execution),
    }).catch((error) => {
      console.error("INTELLIGENCE_ADAPTIVE_LESSON_RETIRE_FAILED", {
        organizationId,
        conversationId,
        error: error?.message || String(error),
      });
    }),
    recordAvantiqoVerifiedExecutionOutcome({
      execution: object(execution),
      sourceTurnId: persistedTurnId,
    }).catch((error) => {
      console.error("INTELLIGENCE_VERIFIED_OUTCOME_LEARN_FAILED", {
        error: error?.message || String(error),
      });
    }),
    recordAvantiqoKnowledgeUtilityObservation({
      decision: object(decision),
      evidence: object(evidence),
      execution: object(execution),
    }).catch((error) => {
      console.error("INTELLIGENCE_KNOWLEDGE_UTILITY_LEARN_FAILED", {
        error: error?.message || String(error),
      });
    }),
    recordAvantiqoBusinessPartnerExperience({
      sourceTurnId: persistedTurnId,
      decision: object(decision),
      evidence: object(evidence),
      execution: object(execution),
    }).catch((error) => {
      console.error("INTELLIGENCE_EXPERIENCE_RECORD_FAILED", {
        error: error?.message || String(error),
      });
    }),
  ]);

  return {
    conversation: object(data.conversation),
    turn: object(data.turn),
    duplicate: false,
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
    .select("id, role, source, content, decision, evidence, execution, navigation, created_at")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversation.data.id)
    .order("created_at", { ascending: true })
    .limit(100);

  if (turns.error) throw turns.error;

  const verifiedTurns=sanitizeBusinessDiagnosisSnapshot(turns.data||[], {
    organization_id: organizationId,
    conversation_id: conversation.data.id,
    entity_id: conversation.data.entity_id,
    // Historical UI remains visible across period changes; period scope is enforced only for model-context reuse.
  });

  return {
    conversation: conversation.data,
    turns: verifiedTurns,
  };
}
