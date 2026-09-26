import { POST as runOperatorTurnPost } from "../route";
import { resolveOperatorInstantGreeting } from "@/lib/operator/runtime/OperatorInstantGreetingPolicy.js";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  beginAvantiqoLiveExecution,
  publishAvantiqoLiveExecution,
} from "@/lib/platform/runtime/AvantiqoLiveExecutionRuntime";
import {
  classifyPendingOperatorReply,
} from "@/lib/operator/runtime/OperatorHumanDecisionClassifier.js";
import {
  operatorExecutionStatePresentation,
} from "@/lib/operator/presentation/OperatorExecutionStatePresentation.js";
import { runBusinessPartnerBrowserBenchmarkTurn } from "@/lib/operator/runtime/BusinessPartnerBrowserBenchmarkRuntime.mjs";

export const runtime = "nodejs";
// Owned Intelligence is zero-idle. A cold Fast request may first prove that
// Serverless is unscheduled and then hand off to the governed ephemeral Pod
// fallback, including mandatory cleanup. Keep the HTTP function alive long
// enough for that bounded lifecycle; the RunPod runtimes enforce their own
// tighter startup, execution, spend and cleanup ceilings.
export const maxDuration = 900;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function codeInspectionRequest(message) {
  const value = text(message);
  return /\b(code|ui|user interface|page|pages|route|routes|component|components|file|files)\b/i.test(value) &&
    /\b(check|inspect|review|audit|fix|repair|finished|complete|completed|missing|improve)\b/i.test(value);
}

function completionEvent(result, response) {
  const execution = object(result?.execution);
  const capability = object(execution.capability);
  const details = object(result?.details);
  const key = text(capability.key || result?.decision?.execution?.capability_key);
  const capabilityMode = text(capability.mode || result?.decision?.execution?.mode).toLowerCase();
  const readOnlyCapability = !key || capabilityMode === "read";
  const mutationPossible = Boolean(key && capabilityMode && capabilityMode !== "read");
  const succeeded = response.ok && result?.success !== false;
  const proofIntegrityFailure = text(details.code) === "BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_FAILURE";
  const diagnosisNotReady = text(details.code) === "BUSINESS_DIAGNOSIS_NOT_READY";
  const presentation = succeeded ? operatorExecutionStatePresentation(result) : null;
  const pending = presentation?.tone === "pending";
  const blocked = presentation?.tone === "blocked";
  const verified = presentation?.tone === "verified";
  const checked = presentation?.tone === "checked";
  const successPhase = pending
    ? text(presentation?.label).toUpperCase().replace(/[^A-Z0-9]+/g, "_") || "TURN_WAITING"
    : blocked
      ? "TURN_BLOCKED"
      : verified
        ? "BUSINESS_EFFECT_VERIFIED"
        : checked
          ? "TURN_CHECKED"
          : "TURN_COMPLETE";
  const successStatus = pending
    ? "waiting"
    : blocked
      ? "blocked"
      : "completed";
  const successDescription =
    text(presentation?.detail) ||
    (key
      ? `Finished the governed ${key} turn without overstating an unverified business effect.`
      : "Finished reasoning and preparing the response.");
  return {
    lane: key === "platform.code_ai_autonomous.execute" || key === "platform.product_engineering_cycle.execute"
      ? "code"
      : "intelligence",
    phase: succeeded ? successPhase : proofIntegrityFailure ? "DIAGNOSIS_PROOF_INTEGRITY_FAILED" : diagnosisNotReady ? "DIAGNOSIS_NOT_READY" : "TURN_FAILED",
    status: succeeded ? successStatus : "failed",
    description: succeeded
      ? successDescription
      : proofIntegrityFailure
        ? "Stopped the diagnosis because its proof could not be verified."
        : diagnosisNotReady
          ? "Stopped before diagnosis because required proof authenticity is not ready."
          : "The Business Partner turn stopped before successful completion.",
    capability_key: key || null,
    read_only: readOnlyCapability,
    mutation_possible: mutationPossible,
    mutation_running: false,
    paid_execution_running: false,
    verification_running: false,
    integrity_failure: proofIntegrityFailure,
    diagnosis_not_ready: diagnosisNotReady,
    integrity_code: proofIntegrityFailure ? text(details.code) : null,
    integrity_stage: proofIntegrityFailure ? text(details.stage) : null,
    readiness_code: diagnosisNotReady ? text(details.code) : null,
    readiness_status: diagnosisNotReady ? text(details.readiness_status) : null,
    authority_effect: proofIntegrityFailure || diagnosisNotReady ? text(details.authority_effect) || "NONE" : null,
    reason: succeeded ? null : text(result?.error || execution.reason || response.statusText),
  };
}

export async function POST(request) {
  let context = null;
  let liveExecutionId = null;
  try {
    const body = await request.clone().json();
    const organizationId = text(body.organizationId || body.organization_id);
    if (organizationId) {
      const access = await requireOrganizationAccess({ organizationId, request });
      if (access.success) {
        const browserBenchmarkTurn = await runBusinessPartnerBrowserBenchmarkTurn({
          organizationId: access.organizationId || organizationId,
          partyId: access.staff?.party_id || access.staff?.partyId || null,
          entityId: text(body.entityId || body.entity_id) || null,
          message: body.message,
          conversation: Array.isArray(body.conversation) ? body.conversation : [],
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
              navigation: { target_id: null },
              execution: { capability_key: null, payload: {}, reason: null },
              plan: [],
            },
            navigation: null,
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
        const instantGreeting = resolveOperatorInstantGreeting({
          message: body.message,
          source: body.source || "text",
        });
        if (instantGreeting) {
          return Response.json({
            success: true,
            decision: {
              response_text: instantGreeting,
              response_language: text(body.locale) || null,
              intent: "answer",
              confidence: 1,
              clarification: { required: false, question: null, options: [] },
              navigation: { target_id: null },
              execution: { capability_key: null, payload: {}, reason: null },
              plan: [],
            },
            state_unchanged: true,
            navigation: null,
            execution: null,
            provider_evidence: { provider: "avantiqo-local", model: "operator-instant-social-reflex-v1", usage_id: null },
            operator_catalog: {
              instant_response: true,
              intelligence_lease_required: false,
              provider_request_performed: false,
              project_context_loaded: false,
              memory_loaded: false,
              mutation_executed: false,
            },
          });
        }
        context = {
          organizationId: access.organizationId || organizationId,
          partyId: access.staff?.party_id || access.staff?.partyId || null,
          actor: { id: access.user?.id || access.userId || null },
        };
        const codeInspection = codeInspectionRequest(body.message);
        const liveExecution = await beginAvantiqoLiveExecution({
          context,
          lane: codeInspection ? "code" : "intelligence",
          description: codeInspection
            ? "I’m checking the requested UI and code surface now."
            : "I’m understanding your request and checking the current business context.",
        }).catch(() => null);
        liveExecutionId = text(liveExecution?.live_execution?.execution_id) || null;
        if (codeInspection) {
          await publishAvantiqoLiveExecution({
            context,
            executionId: liveExecutionId,
            event: {
              lane: "code", phase: "CODE_INSPECTION_ROUTING", status: "running",
              description: "I’m checking the relevant pages, components and verification path before making any change.",
              read_only: true, mutation_possible: false, paid_execution_possible: false, paid_execution_running: false,
            },
          }).catch(() => null);
        } else {
          await publishAvantiqoLiveExecution({
            context,
            executionId: liveExecutionId,
            event: {
              lane: "intelligence", phase: "REQUEST_ROUTING", status: "running",
              description: "I’m routing your request to the correct business capability and current organization context.",
              read_only: true, mutation_possible: false, paid_execution_possible: false, paid_execution_running: false,
            },
          }).catch(() => null);
        }
      }
    }
  } catch {
    context = null;
  }

  try {
    const response = await runOperatorTurnPost(request, {
      liveExecutionId,
    });
    if (context) {
      const result = await response.clone().json().catch(() => ({}));
      await publishAvantiqoLiveExecution({
        context,
        executionId: liveExecutionId,
        event: completionEvent(result, response),
      }).catch(() => null);
    }
    return response;
  } catch (error) {
    if (context) {
      await publishAvantiqoLiveExecution({
        context,
        executionId: liveExecutionId,
        event: {
          lane: "intelligence",
          phase: text(error?.message).includes("STOP_REQUESTED")
            ? "STOPPED"
            : "TURN_FAILED",
          status: text(error?.message).includes("STOP_REQUESTED")
            ? "cancelled"
            : "failed",
          description: text(error?.message).includes("STOP_REQUESTED")
            ? "Stopped at a safe execution boundary after your Stop request."
            : "The Business Partner turn failed before completion.",
          read_only: true,
          paid_execution_running: false,
          mutation_running: false,
          reason: text(error?.message || error).slice(0, 700),
        },
      }).catch(() => null);
    }
    throw error;
  }
}
