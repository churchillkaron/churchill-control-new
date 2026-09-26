export const runtime = "nodejs";
export const maxDuration = 300;

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import resolveStaffPartyForOrganization from "@/lib/people/runtime/resolveStaffPartyForOrganization";
import { buildBusinessDiagnosisAuditProjection, verifyBusinessDiagnosisAuditProjection, verifyBusinessDiagnosisAnswerContent, BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE } from "@/lib/intelligence/runtime/AvantiqoBusinessDiagnosisReceiptRuntime";
import { verifyBusinessDiagnosisProofAuthenticity, businessDiagnosisProofAuthenticityAcceptable, redactBusinessDiagnosisProofForClient, sealBusinessDiagnosisProofAuthenticity, bindBusinessDiagnosisScopeChecksum, businessDiagnosisUserTurnContentFingerprint } from "@/lib/intelligence/runtime/AvantiqoBusinessDiagnosisProofAuthenticityRuntime";
import { businessDiagnosisReadinessInternalDiagnostic } from "@/lib/intelligence/runtime/AvantiqoBusinessDiagnosisReadinessRuntime";
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
  consolidateOperatorMemory,
  recallIntelligenceMemory,
} from "@/lib/operator/runtime/IntelligenceMemoryRuntime";
import {
  crossConversationAmbiguityTurn,
  recoverCrossConversationProject,
} from "@/lib/operator/runtime/IntelligenceCrossConversationContinuityRuntime";
import {
  mergeOperatorProjectState,
} from "@/lib/operator/contracts/OperatorProjectState";
import {
  conversationAttachmentSetIdFromRequest,
  loadConversationAttachmentSet,
  persistConversationAttachmentAnalysis,
} from "@/lib/platform/runtime/ConversationAttachmentRuntime";
import {
  analyzeConversationAttachments,
  AVANTIQO_ATTACHMENT_ANALYSIS_VERSION,
} from "@/lib/platform/runtime/ConversationAttachmentAnalysisRuntime";
import {
  prepareBankStatementAttachment,
} from "@/lib/finance/bank-statements/BankStatementAttachmentPreparationRuntime";
import {
  prepareInventoryAttachment,
} from "@/lib/inventory/runtime/InventoryAttachmentPreparationRuntime";
import {
  prepareGoodsReceiptAttachment,
} from "@/lib/inventory/procurement/receiving/GoodsReceiptAttachmentPreparationRuntime";
import {
  preparePaidExpenseReceiptAttachment,
} from "@/lib/finance/expense-receipts/PaidExpenseReceiptAttachmentPreparationRuntime";
import {
  prepareVendorBillAttachment,
} from "@/lib/finance/accounts-payable/runtime/VendorBillAttachmentPreparationRuntime";
import {
  preparePurchaseOrderAttachment,
} from "@/lib/inventory/procurement/purchase-orders/runtime/PurchaseOrderAttachmentPreparationRuntime";
import {
  prepareSupplierPriceAttachment,
} from "@/lib/inventory/procurement/suppliers/SupplierPriceAttachmentPreparationRuntime";
import {
  prepareSupplierAttachment,
} from "@/lib/inventory/procurement/suppliers/SupplierAttachmentPreparationRuntime";
import { prepareRecipeAttachment } from "@/lib/inventory/production/RecipeAttachmentPreparationRuntime";
import {
  routeAnalyzedAttachment,
} from "@/lib/platform/runtime/UniversalAttachmentRoutingRuntime";
import { ERP_REGISTRY } from "@/lib/platform/registry/erpRegistry";
import {
  matchAnalyzedAttachmentToBusiness,
} from "@/lib/platform/runtime/UniversalAttachmentBusinessMatchRuntime";
import { attachmentLogicalObjects } from "@/lib/platform/runtime/ConversationAttachmentObjectRuntime";
import { buildIntelligenceContextBudget } from "@/lib/operator/runtime/IntelligenceContextBudgetRuntime";
import { resolveOperatorInstantGreeting } from "@/lib/operator/runtime/OperatorInstantGreetingPolicy.js";
import { preflightHumanBusinessPartnerTurn } from "@/lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js";
import { resolvePreSemanticReadIntent } from "@/lib/operator/runtime/OperatorPreSemanticReadRuntime.js";
import { collectOperatorPresentationArtifacts } from "@/lib/operator/runtime/OperatorPresentationArtifactRuntime";
import { loadAvantiqoLiveExecution } from "@/lib/platform/runtime/AvantiqoLiveExecutionRuntime";
import { runBusinessPartnerBrowserBenchmarkTurn } from "@/lib/operator/runtime/BusinessPartnerBrowserBenchmarkRuntime.mjs";

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

function persistedBusinessDiagnosisEvidence(result = {}, { organizationId = null, conversationId = null, entityId = null, periodId = null, userTurnId = null, userTurnContent = null } = {}) {
  const diagnosis = object(result?.business_diagnosis);
  if (!text(diagnosis.receipt_fingerprint)) return {};
  const projection = buildBusinessDiagnosisAuditProjection({
    receipt_fingerprint: diagnosis.receipt_fingerprint,
    receipt_contract: diagnosis.receipt_contract,
    diagnosis_class: diagnosis.class,
    business_timezone: diagnosis.business_timezone,
    answer_content_fingerprint: diagnosis.answer_content_fingerprint,
    final_evidence_state: diagnosis.final_evidence_state,
    residual_material: diagnosis.residual_material,
    answer_boundary_status: diagnosis.answer_boundary_status,
    answer_unsupported_recommendation_outcome_detected: diagnosis.answer_unsupported_recommendation_outcome_detected,
    validated_external_context_count: diagnosis.validated_external_context_count,
    unresolved_external_context_count: diagnosis.unresolved_external_context_count,
    baseline_period_id: diagnosis?.periods?.baseline_period_id,
    baseline_period_start_date: diagnosis?.periods?.baseline_start_date,
    baseline_period_end_date: diagnosis?.periods?.baseline_end_date,
    current_period_id: diagnosis?.periods?.current_period_id,
    current_period_start_date: diagnosis?.periods?.current_start_date,
    current_period_end_date: diagnosis?.periods?.current_end_date,
  });
  const suppliedProjectionFingerprint = text(diagnosis.audit_projection_fingerprint) || null;
  const suppliedProjectionContract = text(diagnosis.audit_projection_contract) || null;
  const verification = verifyBusinessDiagnosisAuditProjection({
    ...projection,
    class: projection.diagnosis_class,
    audit_projection_contract: suppliedProjectionContract,
    audit_projection_fingerprint: suppliedProjectionFingerprint,
  });
  const answerVerification = verifyBusinessDiagnosisAnswerContent({audit_projection_contract:suppliedProjectionContract,answer_content_fingerprint:diagnosis.answer_content_fingerprint}, result?.decision?.response_text || result?.result?.response || "");
  const authenticityVerification = verifyBusinessDiagnosisProofAuthenticity(diagnosis);
  const authenticityAcceptable = businessDiagnosisProofAuthenticityAcceptable(authenticityVerification);
  if (verification.status !== "VERIFIED" || answerVerification.status !== "VERIFIED" || !authenticityAcceptable) return {};
  const diagnosedPeriodId = text(diagnosis?.periods?.current_period_id) || null;
  const activePeriodId = text(periodId) || null;
  if (diagnosedPeriodId && activePeriodId && diagnosedPeriodId !== activePeriodId) return {};
  const persistenceBase = {
    ...diagnosis,
    scope_organization_id: text(organizationId) || null,
    scope_conversation_id: text(conversationId) || null,
    scope_entity_id: text(entityId) || null,
    scope_period_id: diagnosedPeriodId || activePeriodId,
    scope_user_turn_id: text(userTurnId) || null,
    scope_user_content_fingerprint: text(userTurnId) ? businessDiagnosisUserTurnContentFingerprint(userTurnContent) : null,
  };
  const checksummedPersistenceBase = bindBusinessDiagnosisScopeChecksum(persistenceBase);
  const persistenceSeal = sealBusinessDiagnosisProofAuthenticity(checksummedPersistenceBase);
  const persistedProof = persistenceSeal.sealed ? persistenceSeal.proof : checksummedPersistenceBase;
  return {
    business_diagnosis: {
      contract: text(diagnosis.contract) || null,
      receipt_contract: projection.receipt_contract,
      authenticity_contract: text(persistedProof.authenticity_contract) || null,
      authenticity_algorithm: text(persistedProof.authenticity_algorithm) || null,
      authenticity_key_id: text(persistedProof.authenticity_key_id) || null,
      authenticity_mac: text(persistedProof.authenticity_mac) || null,
      authenticity_status: persistenceSeal.sealed ? "AUTHENTICATED" : authenticityVerification.status,
      authenticity_verified: persistenceSeal.sealed ? true : authenticityVerification.verified === true,
      scope_organization_id: text(persistedProof.scope_organization_id) || null,
      scope_conversation_id: text(persistedProof.scope_conversation_id) || null,
      scope_entity_id: text(persistedProof.scope_entity_id) || null,
      scope_period_id: text(persistedProof.scope_period_id) || null,
      scope_user_turn_id: text(persistedProof.scope_user_turn_id) || null,
      scope_user_content_fingerprint: text(persistedProof.scope_user_content_fingerprint) || null,
      scope_checksum_contract: text(persistedProof.scope_checksum_contract) || null,
      scope_checksum: text(persistedProof.scope_checksum) || null,
      class: projection.diagnosis_class,
      business_timezone: projection.business_timezone,
      answer_content_fingerprint: projection.answer_content_fingerprint,
      receipt_fingerprint: projection.receipt_fingerprint,
      audit_projection_contract: suppliedProjectionContract,
      audit_projection_fingerprint: suppliedProjectionFingerprint,
      final_evidence_state: projection.final_evidence_state,
      residual_material: projection.residual_material,
      answer_boundary_status: projection.answer_boundary_status,
      answer_unsupported_recommendation_outcome_detected: projection.answer_unsupported_recommendation_outcome_detected,
      validated_external_context_count: projection.validated_external_context_count,
      unresolved_external_context_count: projection.unresolved_external_context_count,
      periods: { status: text(diagnosis?.periods?.status) || null, ...projection.periods },
      raw_web_content_persisted: false,
      raw_reasoning_persisted: false,
      authority_effect: "NONE",
    },
  };
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
      ...(message?.role === "assistant" && message?.clarification && typeof message.clarification === "object" && !Array.isArray(message.clarification)
        ? { clarification: {
            required: message.clarification.required === true,
            field_key: text(message.clarification.field_key).slice(0, 120) || null,
            capability_key: text(message.clarification.capability_key).slice(0, 300) || null,
            accepts_device_location: message.clarification.accepts_device_location === true,
          } }
        : {}),
    }))
    .filter((message) => message.content);
}

function isInsufficientWalletBalance(error) {
  return text(error?.message || error).includes("INSUFFICIENT_WALLET_BALANCE");
}
function isFastIntelligenceSettlementTimeout(error) {
  return /AVANTIQO_(?:INTELLIGENCE|OPERATOR_INTELLIGENCE)_PENDING_SETTLEMENT_TIMEOUT(?::fast)?/i.test(
    text(error?.message || error),
  );
}

function fastIntelligenceTimeoutDetails(error) {
  const code = text(error?.message || error).split(" ")[0].slice(0, 240);
  return {
    code: code || "AVANTIQO_FAST_INTELLIGENCE_TIMEOUT",
    recoverable: true,
    retryable: true,
    conversation_preserved: true,
    business_action_replayed: false,
    mutation_assumed_complete: false,
    conversation_response:
      "I’m still here, but my fast intelligence lane did not return within the conversational time limit even after one safe retry. I stopped the stalled provider job instead of leaving you waiting. Your conversation is preserved and I did not replay or assume any business action. The next turn can continue from the same context.",
  };
}

function governedDiagnosisFailurePersistence(error = {}) {
  if (error?.code === "BUSINESS_DIAGNOSIS_NOT_READY") {
    return {
      content: "This diagnosis was not started because required proof readiness was unavailable. No analysis result or action was persisted.",
      intent: "business_diagnosis_not_ready",
      evidence: {
        business_diagnosis_readiness_failure: {
          code: "BUSINESS_DIAGNOSIS_NOT_READY",
          readiness_status: text(error?.details?.readiness_status) || null,
          blocker_count: Number.isFinite(Number(error?.details?.blocker_count)) ? Number(error.details.blocker_count) : 0,
          authority_effect: "NONE",
        },
      },
    };
  }
  if (error?.code === BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE) {
    const stage = text(error?.details?.stage) || "LIVE_PROOF_REJECTED";
    return {
      content: stage === "PERSISTENCE_PROOF_REJECTED"
        ? "This diagnosis was not saved because its proof could not be verified. No analysis result or action was persisted."
        : "This diagnosis was stopped because its proof could not be verified. No analysis result or action was persisted.",
      intent: "business_diagnosis_integrity_failure",
      evidence: {
        business_diagnosis_integrity_failure: {
          code: BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE,
          stage,
          authority_effect: "NONE",
        },
      },
    };
  }
  return null;
}

async function operatorLiveExecutionStillCurrent({ organizationId, actor, executionId } = {}) {
  const expectedExecutionId = text(executionId);
  if (!expectedExecutionId) return true;
  try {
    const current = await loadAvantiqoLiveExecution({
      context: { organizationId, actor },
    });
    return current?.found === true &&
      text(current?.live_execution?.execution_id) === expectedExecutionId;
  } catch (error) {
    console.error("OPERATOR_LIVE_EXECUTION_CURRENTNESS_CHECK_FAILED", {
      organizationId,
      executionId: expectedExecutionId,
      error: error?.message || String(error),
    });
    return false;
  }
}

async function persistGovernedDiagnosisFailureTurn({
  error, organizationId, conversationId, partyId, source, agreementState, projectState,
  pairedUserTurnId = null, stateMutationAllowed = true,
} = {}) {
  const failure = governedDiagnosisFailurePersistence(error);
  if (!failure) return false;
  const decision = {
    response_text: failure.content,
    intent: failure.intent,
    confidence: 1,
    agreement_state: object(agreementState),
    project_state: object(projectState),
    clarification: { required: false, question: null, options: [] },
    navigation: { target_id: null },
    execution: { capability_key: null, payload: {}, reason: null },
    plan: [],
    authority_effect: "NONE",
    ...(stateMutationAllowed ? {} : { superseded_live_execution: true }),
  };
  const evidence = {
    ...failure.evidence,
    ...(text(pairedUserTurnId) ? { diagnosis_failure_pair: { user_turn_id: text(pairedUserTurnId), authority_effect: "NONE" } } : {}),
    ...(stateMutationAllowed ? {} : {
      live_execution_concurrency: {
        contract: "AVANTIQO_BUSINESS_PARTNER_SUPERSEDED_TURN_V1",
        superseded: true,
        conversation_state_mutation_performed: false,
        authorization_effect: "NONE",
      },
    }),
  };
  if (!stateMutationAllowed) {
    await persistIntelligenceTurn({
      organizationId, conversationId, partyId, role: "assistant", source,
      content: failure.content, decision, evidence, execution: {}, navigation: {},
    });
  } else {
    await persistAssistantTurnAndConversationState({
      organizationId, conversationId, partyId, source,
      content: failure.content, decision, evidence, execution: {}, navigation: {},
      agreementState: object(agreementState), projectState: object(projectState),
    });
  }
  return true;
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

  const partyId = await resolveStaffPartyForOrganization({
    staff: access.staff,
    organizationId: access.organizationId || organizationId,
  });

  if (!partyId) {
    return {
      error: errorResponse(
        "Authenticated staff account has no Party identity in this organization",
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

export async function POST(request, internal = {}) {
  const turnStartedAt = Date.now();
  const trustedLiveExecutionId = text(internal?.liveExecutionId);
  const trustedHeaders = new Headers(request.headers);
  trustedHeaders.delete("x-avantiqo-live-execution-id");
  if (trustedLiveExecutionId) {
    trustedHeaders.set("x-avantiqo-live-execution-id", trustedLiveExecutionId);
  }
  const requestBody = ["GET", "HEAD"].includes(String(request.method || "POST").toUpperCase())
    ? undefined
    : await request.arrayBuffer();
  request = new Request(request.url, {
    method: request.method || "POST",
    headers: trustedHeaders,
    ...(requestBody ? { body: requestBody } : {}),
  });

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

    const instantGreeting = resolveOperatorInstantGreeting({ message, source });
    if (instantGreeting) {
      const totalMs = Date.now() - turnStartedAt;
      const response = Response.json({
        success: true,
        decision: {
          response_text: instantGreeting,
          response_language: text(body.locale) || null,
          intent: "answer", confidence: 1,
          clarification: { required: false, question: null, options: [] },
          navigation: { target_id: null },
          execution: { capability_key: null, payload: {}, reason: null },
          plan: [],
        },
        state_unchanged: true,
        navigation: null, execution: null,
        provider_evidence: { provider: "avantiqo-local", model: "operator-instant-social-reflex-v1", usage_id: null },
        operator_catalog: {
          instant_response: true, intelligence_lease_required: false, provider_request_performed: false,
          project_context_loaded: false, memory_loaded: false, mutation_executed: false,
        },
      });
      response.headers.set("Server-Timing", `access;dur=${accessMs}, social_reflex;dur=${totalMs}, total;dur=${totalMs}`);
      return response;
    }

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

    const browserBenchmarkTurn = await runBusinessPartnerBrowserBenchmarkTurn({
      organizationId: businessContext.organizationId,
      partyId,
      entityId: businessContext.entityId,
      message,
      conversation: boundedConversation(body.conversation),
    });
    if (browserBenchmarkTurn) {
      return Response.json({
        success: true,
        state_unchanged: true,
        decision: {
          response_text: JSON.stringify(browserBenchmarkTurn.decision),
          intent: "benchmark",
          confidence: 1,
          clarification: { required: false, question: null, options: [] },
          agreement_state: {},
          project_state: {},
        },
        execution: { status: "not_run", capability: null, result: null },
        provider_evidence: {
          contract: browserBenchmarkTurn.contract,
          synthetic_only: true,
          business_mutation_performed: false,
          conversation_persisted: false,
          authorization_effect: "NONE",
        },
        agreement_state: {},
        project_state: {},
        authorization_effect: "NONE",
      });
    }

    const attachmentSetId = conversationAttachmentSetIdFromRequest(request);
    const immediateConversation = boundedConversation(body.conversation).slice(-2);
    let preflightSemanticUnderstanding = null;
    if (!attachmentSetId && source !== "event") {
      try {
        preflightSemanticUnderstanding = resolvePreSemanticReadIntent({
          message,
          immediateConversation: [...immediateConversation, { role: "user", content: message }],
          deviceLocation: object(body?.clientContext).deviceLocation || null,
        });
        if (
          preflightSemanticUnderstanding?.client_location_requested === true &&
          !object(body?.clientContext).deviceLocation
        ) {
          return Response.json({
            success: true,
            state_unchanged: true,
            client_context_request: {
              kind: "device_location",
              field_key: text(preflightSemanticUnderstanding.clarification_field).slice(0, 120) || "location",
              capability_key: text(preflightSemanticUnderstanding.capability_key).slice(0, 300) || null,
            },
            authorization_effect: "NONE",
          });
        }
        const preflight = preflightSemanticUnderstanding || await preflightHumanBusinessPartnerTurn({
          organizationId: businessContext.organizationId,
          partyId,
          entityId: businessContext.entityId,
          message,
          immediateConversation,
        });
        const selfContained = Boolean(
          preflight &&
          preflight.context_required !== true &&
          preflight.requires_mutation !== true &&
          text(preflight.goal_relation).toLowerCase() === "new"
        );
        const immediateContextSufficient = Boolean(
          preflight &&
          preflight.immediate_context_sufficient === true &&
          preflight.context_required !== true &&
          preflight.requires_mutation !== true &&
          text(preflight.goal_relation).toLowerCase() === "new"
        );
        if (selfContained || immediateContextSufficient) {
          const externalFact =
            preflight.route === "evidence" &&
            ["external", "both"].includes(text(preflight.evidence_scope).toLowerCase()) &&
            preflight.needs_current_evidence === true;
          preflightSemanticUnderstanding = {
            ...preflight,
            state_neutral_turn: externalFact,
            preflight_reused_without_durable_reclassification: true,
          };
        } else {
          preflightSemanticUnderstanding = null;
        }
      } catch (preflightError) {
        console.warn("OPERATOR_CONTEXT_FREE_PREFLIGHT_SKIPPED", {
          error: text(preflightError?.message || preflightError).slice(0, 300),
          authorization_effect: "NONE",
        });
      }
    }
    const conversationAttachments = attachmentSetId
      ? await loadConversationAttachmentSet({
          context: { organizationId: businessContext.organizationId, actor },
          attachment_set_id: attachmentSetId,
        })
      : { found: false, files: [] };
    if (conversationAttachments.expired === true) {
      return errorResponse("Attachment set expired. Please attach the files again.", 410);
    }
    if (attachmentSetId && conversationAttachments.found !== true) {
      return errorResponse("Attachment set not found.", 404);
    }

    const analyzedConversationAttachments = attachmentSetId
      ? await analyzeConversationAttachments({
          files: conversationAttachments.files || [],
          context: {
            organizationId: businessContext.organizationId,
            entityId: businessContext.entityId,
            partyId,
          },
        })
      : [];
    if (attachmentSetId) {
      try {
        await persistConversationAttachmentAnalysis({
          context: { organizationId: businessContext.organizationId, actor },
          attachment_set_id: attachmentSetId,
          files: analyzedConversationAttachments,
          analysis_version: AVANTIQO_ATTACHMENT_ANALYSIS_VERSION,
        });
      } catch (cacheError) {
        console.error("OPERATOR_ATTACHMENT_ANALYSIS_CACHE_FAILED", cacheError);
      }
    }

    const logicalConversationAttachments = analyzedConversationAttachments.flatMap((file) =>
      attachmentLogicalObjects(file),
    );

    const matchedConversationAttachments = await Promise.all(
      logicalConversationAttachments.map(async (file) => {
        try {
          const businessMatch = await matchAnalyzedAttachmentToBusiness({
            file,
            organizationId: businessContext.organizationId,
            entityId: businessContext.entityId,
          });
          return { ...file, business_match: businessMatch };
        } catch (matchError) {
          console.error("OPERATOR_ATTACHMENT_BUSINESS_MATCH_FAILED", matchError);
          return { ...file, business_match: { status: "MATCH_UNAVAILABLE", authorization_effect: "NONE" } };
        }
      }),
    );

    const preparedConversationAttachments = await Promise.all(
      matchedConversationAttachments.map(async (file) => {
        const bankStatement = await prepareBankStatementAttachment({
          file,
          organizationId: businessContext.organizationId,
          entityId: businessContext.entityId,
        });
        if (bankStatement.recognized === true) {
          return { ...file, prepared_candidate: { type: "bank_statement", ...bankStatement } };
        }
        const inventoryImport = await prepareInventoryAttachment({
          file,
          organizationId: businessContext.organizationId,
          entityId: businessContext.entityId,
        });
        if (inventoryImport.recognized === true) {
          return { ...file, prepared_candidate: inventoryImport };
        }
        const goodsReceipt = await prepareGoodsReceiptAttachment({
          file,
          organizationId: businessContext.organizationId,
          entityId: businessContext.entityId,
        });
        if (goodsReceipt.recognized === true) {
          return { ...file, prepared_candidate: { type: "goods_receipt", ...goodsReceipt } };
        }
        const paidExpense = await preparePaidExpenseReceiptAttachment({
          file,
          organizationId: businessContext.organizationId,
          entityId: businessContext.entityId,
        });
        if (paidExpense.recognized === true) {
          return { ...file, prepared_candidate: { type: "paid_expense_receipt", ...paidExpense } };
        }
        const vendorBill = await prepareVendorBillAttachment({
          file,
          organizationId: businessContext.organizationId,
          entityId: businessContext.entityId,
        });
        if (vendorBill.recognized === true) {
          return { ...file, prepared_candidate: { type: "vendor_bill", ...vendorBill } };
        }
        const purchaseOrder = await preparePurchaseOrderAttachment({
          file,
          organizationId: businessContext.organizationId,
          entityId: businessContext.entityId,
        });
        if (purchaseOrder.recognized === true) {
          return { ...file, prepared_candidate: { type: "purchase_order", ...purchaseOrder } };
        }
        const recipe = await prepareRecipeAttachment({ file, organizationId: businessContext.organizationId, entityId: businessContext.entityId });
        if (recipe.recognized === true) return { ...file, prepared_candidate: { type: "recipe", ...recipe } };
        const supplierPrice = await prepareSupplierPriceAttachment({
          file,
          organizationId: businessContext.organizationId,
          entityId: businessContext.entityId,
        });
        if (supplierPrice.recognized === true) {
          return { ...file, prepared_candidate: { type: "supplier_price", ...supplierPrice } };
        }
        const supplier = await prepareSupplierAttachment({
          file,
          organizationId: businessContext.organizationId,
        });
        if (supplier.recognized === true) {
          return { ...file, prepared_candidate: { type: "supplier", ...supplier } };
        }
        const destination = routeAnalyzedAttachment(file, { registry: ERP_REGISTRY });
        return destination
          ? { ...file, prepared_candidate: destination }
          : file;
      }),
    );

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
    const longTermMemoryStartedAt = Date.now();
    const memoryCostTelemetry = {
      recall_passes: 0,
      recall_scope_count: 0,
      recall_candidate_limit: 0,
      recall_candidate_rows: 0,
      recall_unique_candidates: 0,
      recall_selected_rows: 0,
      recall_metadata_rows_hydrated: 0,
      recall_telemetry_writes: 0,
    };
    const skipHistoricalContext = Boolean(preflightSemanticUnderstanding);
    const continuityPromise = skipHistoricalContext
      ? Promise.resolve({ recovered: false, ambiguous: false, reason: "SELF_CONTAINED_PREFLIGHT" })
      : recoverCrossConversationProject({
          organizationId: businessContext.organizationId,
          partyId,
          currentConversationId: memory.conversation.id,
          message,
          currentProjectState: memory.projectState,
        }).catch((continuityError) => {
          console.error(
            "OPERATOR_CROSS_CONVERSATION_CONTINUITY_FAILED",
            continuityError,
          );
          return {
            recovered: false,
            ambiguous: false,
            reason: "RECOVERY_FAILED",
          };
        });
    const currentProjectMemoryPromise = skipHistoricalContext
      ? Promise.resolve([])
      : recallIntelligenceMemory({
          organizationId: businessContext.organizationId,
          partyId,
          entityId: businessContext.entityId,
          message,
          projectState: object(memory.projectState),
          telemetry: memoryCostTelemetry,
        }).catch((memoryError) => {
          console.error("OPERATOR_LONG_TERM_MEMORY_RECALL_FAILED", memoryError);
          return [];
        });

    const [continuity, currentProjectMemory] = await Promise.all([
      continuityPromise,
      currentProjectMemoryPromise,
    ]);
    const continuityMs = Date.now() - continuityStartedAt;

    const effectiveProjectState = continuity.recovered === true
      ? object(continuity.project_state)
      : object(memory.projectState);

    let longTermMemory = currentProjectMemory;
    let longTermMemoryReread = false;
    if (continuity.recovered === true) {
      longTermMemoryReread = true;
      try {
        longTermMemory = await recallIntelligenceMemory({
          organizationId: businessContext.organizationId,
          partyId,
          entityId: businessContext.entityId,
          message,
          projectState: effectiveProjectState,
          telemetry: memoryCostTelemetry,
        });
      } catch (memoryError) {
        console.error(
          "OPERATOR_RECOVERED_PROJECT_MEMORY_RECALL_FAILED",
          memoryError,
        );
      }
    }
    const longTermMemoryMs = Date.now() - longTermMemoryStartedAt;

    const persistedConversation = boundedConversation(memory.recentConversation);
    const conversation = skipHistoricalContext
      ? preflightSemanticUnderstanding?.immediate_context_sufficient === true
        ? immediateConversation
        : []
      : persistedConversation;
    // Authorization-critical Operator state is server-authoritative. Client
    // agreement_state may be stale or forged and is never merged into execution
    // state. Cross-conversation continuity intentionally recovers project state
    // only; it never recovers agreement_state, pending confirmations, approvals,
    // or prior mutable business evidence.
    const agreementState = object(memory.agreementState);
    const contextBudget = buildIntelligenceContextBudget({
      conversation,
      projectState: effectiveProjectState,
      longTermMemory,
      attachments: preparedConversationAttachments,
      lane: "fast",
      scope: {
        organization_id: businessContext.organizationId,
        entity_id: businessContext.entityId || null,
      },
    });
    const boundedConversationContext = contextBudget.recent_conversation;
    const boundedLongTermMemory = contextBudget.durable_memory;

    console.info("OPERATOR_CONTEXT_BUDGET_V1", JSON.stringify({
      organization_id: businessContext.organizationId,
      entity_scoped: Boolean(businessContext.entityId),
      source,
      ...contextBudget.telemetry,
    }));

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
          conversation: boundedConversationContext,
          longTermMemory: boundedLongTermMemory,
          conversationAttachments: contextBudget.attachments,
          contextFingerprint: contextBudget.context_fingerprint,
          callerRequest: request,
          conversationId: memory.conversation.id,
          semanticUnderstanding: preflightSemanticUnderstanding,
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

    let result;
    let persistedUserTurn = null;
    try {
      [result, persistedUserTurn] = await Promise.all([
        operatorPromise,
        userPersistPromise,
      ]);
    } catch (operatorError) {
      persistedUserTurn = await userPersistPromise.catch(() => null);
      if (text(persistedUserTurn?.id)) {
        const failureStateMutationAllowed = await operatorLiveExecutionStillCurrent({
          organizationId: businessContext.organizationId,
          actor,
          executionId: trustedLiveExecutionId,
        });
        await persistGovernedDiagnosisFailureTurn({
          error: operatorError,
          organizationId: businessContext.organizationId,
          conversationId: memory.conversation.id,
          partyId,
          source,
          agreementState,
          projectState: effectiveProjectState,
          pairedUserTurnId: persistedUserTurn.id,
          stateMutationAllowed: failureStateMutationAllowed,
        });
      }
      throw operatorError;
    }

    const responseText =
      text(result?.decision?.response_text) ||
      "I couldn't produce a reliable response for that turn. No action was assumed complete.";
    const normalizedDecision = {
      ...object(result?.decision),
      response_text: responseText,
    };
    const returnedAgreementState =
      result?.agreement_state ||
      normalizedDecision.agreement_state;
    const nextAgreementState =
      returnedAgreementState &&
      typeof returnedAgreementState === "object" &&
      !Array.isArray(returnedAgreementState)
        ? returnedAgreementState
        : agreementState;
    const presentationArtifacts = collectOperatorPresentationArtifacts({
      execution: object(result?.execution),
      provider_evidence: object(result?.provider_evidence),
    });
    const recommendationLearningContext = object(
      object(nextAgreementState).recommended_action ||
      object(agreementState).recommended_action,
    );
    const recommendationLearningProof = object(recommendationLearningContext.proof);
    const learningSignals = {
      semantic_correction:
        object(result?.provider_evidence).semantic_correction_or_revision === true ||
        object(result?.operator_catalog).semantic_correction_or_revision === true,
      recommendation_rejected:
        object(result?.operator_catalog).recommendation_proposal_rejected === true,
      recommendation_selected:
        object(result?.operator_catalog).recommendation_selected === true,
      recommendation_capability_key:
        text(recommendationLearningContext.capability_key).slice(0, 300) || null,
      recommendation_evidence_class:
        text(recommendationLearningProof.evidence_class).slice(0, 80) || null,
      clarification_required:
        object(normalizedDecision.clarification).required === true,
      artifact_reused:
        object(result?.operator_catalog).semantic_artifact_reuse === true ||
        object(result?.operator_catalog).artifact_reused === true ||
        object(result?.operator_catalog).prior_artifact_reused === true,
      response_detail_deep:
        String(object(result?.provider_evidence).semantic_response_detail || "").toLowerCase() === "deep",
      response_detail_brief:
        String(object(result?.provider_evidence).semantic_response_detail || "").toLowerCase() === "brief",
      context_expanded:
        String(object(result?.provider_evidence).semantic_context_depth || "").toLowerCase() === "expanded",
      authorization_effect: "NONE",
    };
    const normalizedProviderEvidence = {
      ...object(result?.provider_evidence),
      learning_signals: learningSignals,
      ...(presentationArtifacts.length ? { presentation_artifacts: presentationArtifacts } : {}),
    };
    const normalizedResult = {
      ...object(result),
      decision: normalizedDecision,
      provider_evidence: normalizedProviderEvidence,
      presentation_artifacts: presentationArtifacts,
    };
    const nextProjectState = deriveProjectState(
      effectiveProjectState,
      normalizedResult,
    );
    const turnDuplicatePayloadBytesAvoided = Buffer.byteLength(JSON.stringify({
      response_text: responseText,
      agreement_state: object(nextAgreementState),
      project_state: object(nextProjectState),
    }), "utf8");
    const persistedDecision = {
      ...normalizedDecision,
      paired_user_turn_id: text(persistedUserTurn?.id) || null,
    };
    delete persistedDecision.response_text;
    delete persistedDecision.agreement_state;
    delete persistedDecision.project_state;

    const supersededByNewerExecution = !(await operatorLiveExecutionStillCurrent({
      organizationId: businessContext.organizationId,
      actor,
      executionId: trustedLiveExecutionId,
    }));

    const diagnosisPersistenceEvidence = persistedBusinessDiagnosisEvidence(result, {
      organizationId: businessContext.organizationId,
      conversationId: memory.conversation.id,
      entityId: businessContext.entityId,
      periodId: businessContext.periodId,
      userTurnId: persistedUserTurn?.id || null,
      userTurnContent: message,
    });
    const diagnosisResultPresent =
      Object.keys(object(result?.business_diagnosis)).length > 0 ||
      text(normalizedDecision.intent) === "business_diagnosis";
    if (diagnosisResultPresent && !object(diagnosisPersistenceEvidence).business_diagnosis) {
      const persistenceError = businessDiagnosisProofIntegrityError("PERSISTENCE_PROOF_REJECTED");
      await persistGovernedDiagnosisFailureTurn({
        error: persistenceError,
        organizationId: businessContext.organizationId,
        conversationId: memory.conversation.id,
        partyId,
        source,
        agreementState: nextAgreementState,
        projectState: nextProjectState,
        pairedUserTurnId: persistedUserTurn?.id || null,
        stateMutationAllowed: !supersededByNewerExecution,
      });
      throw persistenceError;
    }

    const assistantPersistStartedAt = Date.now();
    const longTermLearnStartedAt = Date.now();
    let longTermLearned = 0;
    let projectStateMemoryReused = 0;
    let projectStateMemoryRepaired = 0;
    const assistantEvidence = {
      ...object(result?.provider_evidence),
      ...diagnosisPersistenceEvidence,
      ...(supersededByNewerExecution
        ? {
            live_execution_concurrency: {
              contract: "AVANTIQO_BUSINESS_PARTNER_SUPERSEDED_TURN_V1",
              execution_id: trustedLiveExecutionId,
              superseded: true,
              conversation_state_mutation_performed: false,
              long_term_learning_performed: false,
              authorization_effect: "NONE",
            },
          }
        : {}),
    };
    const assistantPersistPromise = supersededByNewerExecution
      ? persistIntelligenceTurn({
          organizationId: businessContext.organizationId,
          conversationId: memory.conversation.id,
          partyId,
          role: "assistant",
          source,
          content: responseText,
          decision: {
            ...persistedDecision,
            superseded_live_execution: true,
            paired_user_turn_id: persistedUserTurn?.id || null,
          },
          evidence: assistantEvidence,
          execution: object(result?.execution),
          navigation: object(result?.navigation),
        }).then(async (turn) => {
          const latestSnapshot = await loadIntelligenceConversationSnapshot({
            organizationId: businessContext.organizationId,
            partyId,
            conversationKey: "primary",
          }).catch(() => null);
          return {
            conversation: latestSnapshot?.conversation
              ? object(latestSnapshot.conversation)
              : object(memory.conversation),
            turn: object(turn),
            superseded: true,
          };
        })
      : persistAssistantTurnAndConversationState({
          organizationId: businessContext.organizationId,
          conversationId: memory.conversation.id,
          partyId,
          source,
          content: responseText,
          decision: persistedDecision,
          evidence: assistantEvidence,
          execution: object(result?.execution),
          navigation: object(result?.navigation),
          agreementState: nextAgreementState,
          projectState: nextProjectState,
        });
    const longTermLearnPromise = diagnosisResultPresent
      ? Promise.resolve({ learned: 0, skipped: "BUSINESS_DIAGNOSIS_NOT_MEMORY_PROMOTABLE" })
      : supersededByNewerExecution
        ? Promise.resolve({ learned: 0, skipped: "SUPERSEDED_LIVE_EXECUTION" })
        : learnProjectStateMemories({
          organizationId: businessContext.organizationId,
          partyId,
          entityId: businessContext.entityId,
          conversationId: memory.conversation.id,
          previousProjectState: effectiveProjectState,
          nextProjectState,
        })
          .then((learned) => {
            longTermLearned = Number(learned?.learned || 0);
            projectStateMemoryReused = Number(learned?.reused || 0);
            projectStateMemoryRepaired = Number(learned?.repaired || 0);
            return learned;
          })
          .catch((memoryError) => {
            console.error("OPERATOR_LONG_TERM_MEMORY_LEARN_FAILED", memoryError);
            return { learned: 0, failed: true };
          });

    const [persisted] = await Promise.all([
      assistantPersistPromise,
      longTermLearnPromise,
    ]);
    if (longTermLearned > 0) {
      await consolidateOperatorMemory({
        organizationId: businessContext.organizationId,
        partyId,
        entityId: businessContext.entityId,
      }).catch((memoryError) => {
        console.error("OPERATOR_LONG_TERM_MEMORY_CONSOLIDATION_FAILED", memoryError);
      });
    }

    const assistantPersistMs = Date.now() - assistantPersistStartedAt;
    const longTermLearnMs = Date.now() - longTermLearnStartedAt;
    const persistedState = object(persisted.conversation);
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
        intent: text(normalizedDecision.intent) || null,
        execution_status: text(result?.execution?.status) || null,
        capability_key: text(result?.execution?.capability?.key) || null,
        long_term_memory_recalled: longTermMemory.length,
        long_term_memory_reread_after_recovery: longTermMemoryReread,
        long_term_memory_learned: longTermLearned,
        project_continuity_recovered: continuity.recovered === true,
        project_continuity_ambiguous: continuity.ambiguous === true,
        project_continuity_source_conversation_id:
          continuity.source_conversation_id || null,
      }),
    );
    console.info(
      "OPERATOR_INTELLIGENCE_COST_V1",
      JSON.stringify({
        organization_id: businessContext.organizationId,
        entity_scoped: Boolean(businessContext.entityId),
        source,
        ...memoryCostTelemetry,
        context_estimated_input_tokens: contextBudget.telemetry.estimated_input_tokens,
        context_estimated_bytes: contextBudget.telemetry.estimated_context_bytes,
        context_source_turns: contextBudget.telemetry.source_turns,
        context_dropped_turns: contextBudget.telemetry.dropped_turns,
        context_source_memory_items: contextBudget.telemetry.source_memory_items,
        context_dropped_memory_items: contextBudget.telemetry.dropped_memory_items,
        project_state_memory_learned: longTermLearned,
        project_state_memory_reused: projectStateMemoryReused,
        project_state_memory_repaired: projectStateMemoryRepaired,
        turn_duplicate_payload_bytes_avoided: turnDuplicatePayloadBytesAvoided,
        continuity_memory_reread: longTermMemoryReread,
      }),
    );


    const clientNormalizedResult = {
      ...normalizedResult,
      ...(supersededByNewerExecution
        ? {
            decision: {
              ...object(normalizedResult.decision),
              agreement_state: object(persistedState.agreement_state),
              project_state: object(persistedState.project_state),
            },
            provider_evidence: {
              ...object(normalizedResult.provider_evidence),
              superseded_live_execution: true,
              conversation_state_mutation_performed: false,
            },
          }
        : {}),
      ...(normalizedResult?.business_diagnosis
        ? { business_diagnosis: redactBusinessDiagnosisProofForClient(normalizedResult.business_diagnosis) }
        : {}),
    };

    const response = Response.json({
      ...clientNormalizedResult,
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
      context_budget: {
        contract: contextBudget.contract,
        lane: contextBudget.lane,
        ...contextBudget.telemetry,
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
    if (error?.code === "BUSINESS_DIAGNOSIS_NOT_READY") {
      console.error("BUSINESS_DIAGNOSIS_READINESS_BLOCKED", businessDiagnosisReadinessInternalDiagnostic(error));
      return errorResponse("Business diagnosis is not ready", 503, error.details || { code: "BUSINESS_DIAGNOSIS_NOT_READY", authority_effect: "NONE" });
    }

    console.error("OPERATOR_TURN_ERROR", error);
    if (error?.code === BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE) {
      return errorResponse("Business diagnosis proof verification failed", 500, error.details || { code: BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE, authority_effect: "NONE" });
    }

    const status = Number.isInteger(error?.status) ? error.status : 500;
    const isClientError = status >= 400 && status < 500;

    if (isFastIntelligenceSettlementTimeout(error)) {
      return errorResponse(
        "Fast Intelligence exceeded the conversational time limit.",
        503,
        fastIntelligenceTimeoutDetails(error),
      );
    }

    return errorResponse(
      isClientError
        ? text(error?.message) || "Invalid operator request"
        : "Avantiqo Intelligence is temporarily unavailable. Please retry shortly.",
      isClientError ? status : 500,
    );
  }
}
