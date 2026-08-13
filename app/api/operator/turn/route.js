import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  resolveBusinessContext,
} from "@/lib/business-context/resolveBusinessContext";
import {
  runOperatorTurn,
} from "@/lib/operator/runtime/OperatorTurnRuntime";
import {
  loadIntelligenceConversationSnapshot,
  loadOrCreateIntelligenceConversation,
  persistIntelligenceTurn,
  updateIntelligenceConversationState,
} from "@/lib/operator/runtime/IntelligenceConversationRuntime";
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

function clientAgreementState(body) {
  if (body.agreementState && typeof body.agreementState === "object") {
    return body.agreementState;
  }

  if (body.agreement_state && typeof body.agreement_state === "object") {
    return body.agreement_state;
  }

  return {};
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

    return errorResponse(
      error?.message || "Avantiqo conversation load failed",
      error?.status || 500,
    );
  }
}

export async function POST(request) {
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

    const resolved = await resolvePartyAccess(request, organizationId);
    if (resolved.error) return resolved.error;

    const { access, partyId } = resolved;

    const businessContext = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: requestedEntityId,
      periodId: requestedPeriodId,
      request,
      access,
    });

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

    const memory = await loadOrCreateIntelligenceConversation({
      organizationId: businessContext.organizationId,
      partyId,
      entityId: businessContext.entityId,
      periodId: businessContext.periodId,
      userId: actor.id,
      conversationKey,
    });

    const clientConversation = boundedConversation(body.conversation);
    const persistedConversation = boundedConversation(memory.recentConversation);
    const conversation = persistedConversation.length
      ? persistedConversation
      : clientConversation;
    const agreementState = {
      ...object(clientAgreementState(body)),
      ...object(memory.agreementState),
    };

    const [result] = await Promise.all([
      runOperatorTurn({
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
        projectState: memory.projectState,
        conversation,
        // Required by registry-generated capabilities: they call the same internal
        // APIs the UI calls and forward this request's cookie, so a read runs with
        // the caller's own session. Without it those capabilities cannot execute.
        callerRequest: request,
      }),
      persistIntelligenceTurn({
        organizationId: businessContext.organizationId,
        conversationId: memory.conversation.id,
        partyId,
        role: "user",
        source,
        content: message,
      }),
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
      memory.projectState,
      result,
    );

    const [, persistedState] = await Promise.all([
      persistIntelligenceTurn({
        organizationId: businessContext.organizationId,
        conversationId: memory.conversation.id,
        partyId,
        role: "assistant",
        source,
        content: responseText,
        decision: object(result?.decision),
        evidence: object(result?.provider_evidence),
        execution: object(result?.execution),
        navigation: object(result?.navigation),
      }),
      updateIntelligenceConversationState({
        organizationId: businessContext.organizationId,
        conversationId: memory.conversation.id,
        agreementState: nextAgreementState,
        projectState: nextProjectState,
      }),
    ]);

    return Response.json({
      ...result,
      agreement_state: object(persistedState.agreement_state),
      project_state: object(persistedState.project_state),
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
  } catch (error) {
    console.error("OPERATOR_TURN_ERROR", error);

    return errorResponse(
      error?.message || "Avantiqo Operator failed",
      error?.status || 500,
    );
  }
}
