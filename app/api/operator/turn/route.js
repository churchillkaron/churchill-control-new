export const runtime = "nodejs";
export const maxDuration = 300;

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  resolveBusinessContext,
} from "@/lib/business-context/resolveBusinessContext";
import {
  runSyntheticIntelligenceTurn,
} from "@/lib/operator/runtime/SyntheticIntelligenceTurnRuntime";
import {
  loadIntelligenceConversationSnapshot,
  loadOrCreateIntelligenceConversation,
  persistAssistantTurnAndConversationState,
  persistIntelligenceTurn,
} from "@/lib/operator/runtime/IntelligenceConversationRuntime";
import {
  learnProjectStateMemories,
  recallIntelligenceMemory,
} from "@/lib/operator/runtime/IntelligenceMemoryRuntime";
import {
  crossConversationAmbiguityTurn,
  recoverCrossConversationProject,
} from "@/lib/operator/runtime/IntelligenceCrossConversationContinuityRuntime";
import {
  mergeOperatorProjectState,
} from "@/lib/operator/contracts/OperatorProjectState";

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function errorResponse(error, status = 500, details = null) {
  return Response.json(
    {
      success: false,
      error,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

function boundedConversation(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-12)
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: text(message?.content).slice(0, 6000),
    }))
    .filter((message) => message.content);
}

function isInsufficientWalletBalance(error) {
  return text(error?.message || error).includes("INSUFFICIENT_WALLET_BALANCE");
}

function prepaidBalanceBlockedResult({ agreementState, projectState } = {}) {
  return {
    decision: {
      intent: "service_balance_required",
      response_text:
        "This organization's prepaid service balance is empty. Add service credit to continue.",
      plan: [],
      agreement_state: object(agreementState),
      project_state: object(projectState),
    },
    execution: {
      status: "blocked",
      reason: "INSUFFICIENT_WALLET_BALANCE",
      capability: null,
    },
    provider_evidence: {},
    navigation: null,
    agreement_state: object(agreementState),
  };
}

function deriveProjectState(previousState, result) {
  const decision = object(result?.decision);
  const execution = object(result?.execution);
  const ubteResult = object(execution?.result);
  const capabilityResult = object(ubteResult?.result);
  const systemSnapshot =
    text(execution?.capability?.domain) === "platform" &&
    text(execution?.capability?.capability) === "system" &&
    text(capabilityResult?.snapshot_id)
      ? {
          snapshot_id: text(capabilityResult.snapshot_id),
          phase: text(capabilityResult.phase) || null,
          status: text(capabilityResult.status) || null,
          checked_at: text(capabilityResult.checked_at) || null,
          diagnosis_codes: Array.isArray(capabilityResult.diagnoses)
            ? capabilityResult.diagnoses
                .map((item) => text(item?.code))
                .filter(Boolean)
                .slice(0, 20)
            : [],
          verification_required:
            capabilityResult.verification_required_after_repair === true,
        }
      : null;

  return mergeOperatorProjectState(previousState, decision.project_state, {
    last_intent: text(decision.intent) || null,
    last_plan: Array.isArray(decision.plan) ? decision.plan.slice(0, 12) : [],
    last_response: text(decision.response_text) || null,
    last_execution: execution,
    last_navigation: object(result?.navigation),
    ...(systemSnapshot ? { last_system_snapshot: systemSnapshot } : {}),
  });
}

async function resolvePartyAccess(request, organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
  });

  if (!access.success) {
    return {
      error: errorResponse(access.error, access.status || 403),
    };
  }

  const partyId =
    access.staff?.party_id ||
    access.staff?.partyId ||
    null;

  if (!partyId) {
    return {
      error: errorResponse(
        "Authenticated staff account is not linked to a party",
        409,
      ),
    };
  }

  return { access, partyId };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId =
      text(url.searchParams.get("organizationId")) ||
      text(url.searchParams.get("organization_id"));
    const conversationKey =
      text(url.searchParams.get("conversationKey")) ||
      text(url.searchParams.get("conversation_key")) ||
      "primary";

    const resolved = await resolvePartyAccess(request, organizationId);
    if (resolved.error) return resolved.error;

    const snapshot = await loadIntelligenceConversationSnapshot({
      organizationId: resolved.access.organizationId,
      partyId: resolved.partyId,
      conversationKey,
    });

    return Response.json({
      success: true,
      conversation: snapshot?.conversation || null,
      turns: snapshot?.turns || [],
      agreement_state: object(snapshot?.conversation?.agreement_state),
      project_state: object(snapshot?.conversation?.project_state),
    });
  } catch (error) {
    console.error("OPERATOR_CONVERSATION_LOAD_ERROR", error);

    const status = Number.isInteger(error?.status) ? error.status : 500;
    const isClientError = status >= 400 && status < 500;

    return errorResponse(
      isClientError
        ? text(error?.message) || "Invalid operator request"
        : "Avantiqo conversation load failed",
      isClientError ? status : 500,
    );
  }
}

export async function POST(request) {
  const turnStartedAt = Date.now();

  try {
    const body = await request.json();
    const organizationId = readValue(
      body,
      "organizationId",
      "organization_id",
    );
    const requestedEntityId = readValue(
      body,
      "entityId",
      "entity_id",
    );
    const requestedPeriodId = readValue(
      body,
      "periodId",
      "period_id",
    );
    const message = text(body.message);
    const source = text(body.source) || "text";
    const conversationKey =
      text(body.conversationKey || body.conversation_key) || "primary";

    if (!message) {
      return errorResponse("Message required", 400);
    }

    const accessStartedAt = Date.now();
    const resolved = await resolvePartyAccess(request, organizationId);
    const accessMs = Date.now() - accessStartedAt;
    if (resolved.error) return resolved.error;

    const { access, partyId } = resolved;

    const contextStartedAt = Date.now();
    const businessContext = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: requestedEntityId,
      periodId: requestedPeriodId,
      request,
      access,
    });
    const contextMs = Date.now() - contextStartedAt;

    if (!businessContext.success) {
      return errorResponse(
        businessContext.error,
        businessContext.status || 400,
      );
    }

    const actor = {
      id: access.user?.id || null,
      email: access.user?.email || null,
      partyId,
      party_id: partyId,
      staffAccountId:
        access.access?.staffAccountId ||
        access.staff?.id ||
        null,
      role: access.role || null,
    };

    const memoryStartedAt = Date.now();
    const memory = await loadOrCreateIntelligenceConversation({
      organizationId: businessContext.organizationId,
      partyId,
      entityId: businessContext.entityId,
      periodId: businessContext.periodId,
      userId: actor.id,
      conversationKey,
    });
    const memoryMs = Date.now() - memoryStartedAt;

    const continuityStartedAt = Date.now();
    let continuity = {
      recovered: false,
      ambiguous: false,
      reason: "NOT_CHECKED",
    };
    try {
      continuity = await recoverCrossConversationProject({
        organizationId: businessContext.organizationId,
        partyId,
        message,
        currentProjectState: memory.projectState,
      });
    } catch (continuityError) {
      console.error("OPERATOR_CROSS_CONVERSATION_CONTINUITY_FAILED", continuityError);
    }
    const continuityMs = Date.now() - continuityStartedAt;

    const effectiveProjectState = continuity.recovered === true
      ? object(continuity.project_state)
      : object(memory.projectState);

    const longTermMemoryStartedAt = Date.now();
    let longTermMemory = [];
    try {
      longTermMemory = await recallIntelligenceMemory({
        organizationId: businessContext.organizationId,
        partyId,
        entityId: businessContext.entityId,
        message,
        projectState: effectiveProjectState,
      });
    } catch (memoryError) {
      console.error("OPERATOR_LONG_TERM_MEMORY_RECALL_FAILED", memoryError);
    }
    const longTermMemoryMs = Date.now() - longTermMemoryStartedAt;

    const clientConversation = boundedConversation(body.conversation);
    const persistedConversation = boundedConversation(memory.recentConversation);
    const conversation = persistedConversation.length
      ? persistedConversation
      : clientConversation;
    // Authorization-critical Operator state is server-authoritative. Client
    // agreement_state may be stale or forged and is never merged into execution
    // state. Cross-conversation continuity intentionally recovers project state
    // only; it never recovers agreement_state, pending confirmations, approvals,
    // or prior mutable business evidence.
    const agreementState = object(memory.agreementState);

    let operatorMs = 0;
    let userTurnPersistMs = 0;
    const operatorStartedAt = Date.now();
    const operatorPromise = continuity.ambiguous === true
      ? Promise.resolve(
          crossConversationAmbiguityTurn({
            recovery: continuity,
            agreementState,
          }),
        ).then((value) => {
          operatorMs = Date.now() - operatorStartedAt;
          return value;
        })
      : runSyntheticIntelligenceTurn({
          organizationId: businessContext.organizationId,
          entityId: businessContext.entityId,
          periodId: businessContext.periodId,
          partyId,
          actor,
          role: access.role,
          permissions:
            businessContext.permissions ||
            access.permissions ||
            [],
          locale:
            text(body.locale) ||
            businessContext.locale ||
            null,
          timezone: businessContext.timezone || null,
          message,
          source,
          pathname: text(body.pathname) || null,
          agreementState,
          projectState: effectiveProjectState,
          conversation,
          longTermMemory,
          callerRequest: request,
        })
          .then((value) => {
            operatorMs = Date.now() - operatorStartedAt;
            return value;
          })
          .catch((error) => {
            operatorMs = Date.now() - operatorStartedAt;
            if (!isInsufficientWalletBalance(error)) throw error;

            console.warn("OPERATOR_SERVICE_BALANCE_REQUIRED", {
              organizationId: businessContext.organizationId,
              entityId: businessContext.entityId || null,
            });

            return prepaidBalanceBlockedResult({
              agreementState,
              projectState: effectiveProjectState,
            });
          });
    const userPersistStartedAt = Date.now();
    const userPersistPromise = persistIntelligenceTurn({
      organizationId: businessContext.organizationId,
      conversationId: memory.conversation.id,
      partyId,
      role: "user",
      source,
      content: message,
    }).then((value) => {
      userTurnPersistMs = Date.now() - userPersistStartedAt;
      return value;
    });

    const [result] = await Promise.all([
      operatorPromise,
      userPersistPromise,
    ]);

    const responseText =
      text(result?.decision?.response_text) ||
      "Done.";
    const returnedAgreementState =
      result?.agreement_state ||
      result?.decision?.agreement_state;
    const nextAgreementState =
      returnedAgreementState &&
      typeof returnedAgreementState === "object" &&
      !Array.isArray(returnedAgreementState)
        ? returnedAgreementState
        : agreementState;
    const nextProjectState = deriveProjectState(
      effectiveProjectState,
      result,
    );

    const assistantPersistStartedAt = Date.now();
    const persisted = await persistAssistantTurnAndConversationState({
      organizationId: businessContext.organizationId,
      conversationId: memory.conversation.id,
      partyId,
      source,
      content: responseText,
      decision: object(result?.decision),
      evidence: object(result?.provider_evidence),
      execution: object(result?.execution),
      navigation: object(result?.navigation),
      agreementState: nextAgreementState,
      projectState: nextProjectState,
    });
    const assistantPersistMs = Date.now() - assistantPersistStartedAt;
    const persistedState = object(persisted.conversation);

    const longTermLearnStartedAt = Date.now();
    let longTermLearned = 0;
    try {
      const learned = await learnProjectStateMemories({
        organizationId: businessContext.organizationId,
        partyId,
        entityId: businessContext.entityId,
        conversationId: memory.conversation.id,
        previousProjectState: effectiveProjectState,
        nextProjectState,
      });
      longTermLearned = Number(learned?.learned || 0);
    } catch (memoryError) {
      console.error("OPERATOR_LONG_TERM_MEMORY_LEARN_FAILED", memoryError);
    }
    const longTermLearnMs = Date.now() - longTermLearnStartedAt;
    const totalMs = Date.now() - turnStartedAt;

    const latency = {
      version: 3,
      access_ms: accessMs,
      context_ms: contextMs,
      memory_ms: memoryMs,
      continuity_ms: continuityMs,
      long_term_memory_ms: longTermMemoryMs,
      operator_ms: operatorMs,
      user_turn_persist_ms: userTurnPersistMs,
      assistant_persist_ms: assistantPersistMs,
      long_term_learn_ms: longTermLearnMs,
      total_ms: totalMs,
    };

    console.info(
      "OPERATOR_LATENCY_V3",
      JSON.stringify({
        ...latency,
        organization_id: businessContext.organizationId,
        entity_scoped: Boolean(businessContext.entityId),
        source,
        intent: text(result?.decision?.intent) || null,
        execution_status: text(result?.execution?.status) || null,
        capability_key: text(result?.execution?.capability?.key) || null,
        long_term_memory_recalled: longTermMemory.length,
        long_term_memory_learned: longTermLearned,
        project_continuity_recovered: continuity.recovered === true,
        project_continuity_ambiguous: continuity.ambiguous === true,
        project_continuity_source_conversation_id:
          continuity.source_conversation_id || null,
      }),
    );

    const response = Response.json({
      ...result,
      agreement_state: object(persistedState.agreement_state),
      project_state: object(persistedState.project_state),
      project_continuity: {
        recovered: continuity.recovered === true,
        ambiguous: continuity.ambiguous === true,
        reason: continuity.reason || null,
        source_conversation_id: continuity.source_conversation_id || null,
        authorization_recovered: false,
        mutable_business_evidence_recovered: false,
      },
      conversation: {
        id: persistedState.id,
        key: persistedState.conversation_key,
        status: persistedState.status,
        persistent: true,
      },
      context: {
        organization_id: businessContext.organizationId,
        entity_id: businessContext.entityId,
        period_id: businessContext.periodId,
        party_id: partyId,
        locale: businessContext.locale || null,
        timezone: businessContext.timezone || null,
      },
    });

    response.headers.set(
      "Server-Timing",
      [
        `access;dur=${accessMs}`,
        `context;dur=${contextMs}`,
        `memory;dur=${memoryMs}`,
        `continuity;dur=${continuityMs}`,
        `ltmemory;dur=${longTermMemoryMs}`,
        `operator;dur=${operatorMs}`,
        `persist;dur=${assistantPersistMs}`,
        `ltlearn;dur=${longTermLearnMs}`,
        `total;dur=${totalMs}`,
      ].join(", "),
    );

    return response;
  } catch (error) {
    console.error("OPERATOR_TURN_ERROR", error);

    const status = Number.isInteger(error?.status) ? error.status : 500;
    const isClientError = status >= 400 && status < 500;

    return errorResponse(
      isClientError
        ? text(error?.message) || "Invalid operator request"
        : "Avantiqo Intelligence is temporarily unavailable. Please retry shortly.",
      isClientError ? status : 500,
    );
  }
}
