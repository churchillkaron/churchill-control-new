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
  const succeeded = response.ok && result?.success !== false;
  const proofIntegrityFailure = text(details.code) === "BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_FAILURE";
  const diagnosisNotReady = text(details.code) === "BUSINESS_DIAGNOSIS_NOT_READY";
  return {
    lane: key === "platform.code_ai_autonomous.execute" || key === "platform.product_engineering_cycle.execute"
      ? "code"
      : "intelligence",
    phase: succeeded ? "TURN_COMPLETE" : proofIntegrityFailure ? "DIAGNOSIS_PROOF_INTEGRITY_FAILED" : diagnosisNotReady ? "DIAGNOSIS_NOT_READY" : "TURN_FAILED",
    status: succeeded ? "completed" : "failed",
    description: succeeded
      ? key
        ? `Finished the governed ${key} turn.`
        : "Finished reasoning and preparing the response."
      : proofIntegrityFailure
        ? "Stopped the diagnosis because its proof could not be verified."
        : diagnosisNotReady
          ? "Stopped before diagnosis because required proof authenticity is not ready."
          : "The Business Partner turn stopped before successful completion.",
    capability_key: key || null,
    read_only: !key,
    mutation_possible: Boolean(key && capability.mode && capability.mode !== "read"),
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
  try {
    const body = await request.clone().json();
    const organizationId = text(body.organizationId || body.organization_id);
    if (organizationId) {
      const access = await requireOrganizationAccess({ organizationId, request });
      if (access.success) {
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
        if (codeInspection) {
          await beginAvantiqoLiveExecution({ context, lane: "code", description: "I’m checking the requested UI and code surface now." }).catch(() => null);
          await publishAvantiqoLiveExecution({
            context,
            event: {
              lane: "code", phase: "CODE_INSPECTION_ROUTING", status: "running",
              description: "I’m checking the relevant pages, components and verification path before making any change.",
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
    const response = await runOperatorTurnPost(request);
    if (context) {
      const result = await response.clone().json().catch(() => ({}));
      await publishAvantiqoLiveExecution({
        context,
        event: completionEvent(result, response),
      }).catch(() => null);
    }
    return response;
  } catch (error) {
    if (context) {
      await publishAvantiqoLiveExecution({
        context,
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
