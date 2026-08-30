import { POST as runOperatorTurnPost } from "../route";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  beginAvantiqoLiveExecution,
  publishAvantiqoLiveExecution,
} from "@/lib/platform/runtime/AvantiqoLiveExecutionRuntime";

export const runtime = "nodejs";
export const maxDuration = 60;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function completionEvent(result, response) {
  const execution = object(result?.execution);
  const capability = object(execution.capability);
  const key = text(capability.key || result?.decision?.execution?.capability_key);
  const status = text(execution.status || (response.ok ? "completed" : "failed"));
  const succeeded = response.ok && result?.success !== false;
  return {
    lane: key === "platform.code_ai_autonomous.execute" || key === "platform.product_engineering_cycle.execute"
      ? "code"
      : "intelligence",
    phase: succeeded ? "TURN_COMPLETE" : "TURN_FAILED",
    status: succeeded ? "completed" : "failed",
    description: succeeded
      ? key
        ? `Finished the governed ${key} turn.`
        : "Finished reasoning and preparing the response."
      : "The Business Partner turn stopped before successful completion.",
    capability_key: key || null,
    read_only: !key,
    mutation_possible: Boolean(key && capability.mode && capability.mode !== "read"),
    mutation_running: false,
    paid_execution_running: false,
    verification_running: false,
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
        context = {
          organizationId: access.organizationId || organizationId,
          partyId: access.staff?.party_id || access.staff?.partyId || null,
          actor: {
            id: access.user?.id || access.userId || null,
          },
        };
        await beginAvantiqoLiveExecution({
          context,
          lane: "intelligence",
          description:
            "Understanding your request, checking current context and deciding which governed evidence or capability is needed.",
        }).catch(() => null);
        await publishAvantiqoLiveExecution({
          context,
          event: {
            lane: "intelligence",
            phase: "COGNITIVE_PLANNING",
            status: "running",
            description:
              "Intelligence is building the execution brief. It may use registered read-only evidence tools before choosing an action.",
            read_only: true,
            mutation_possible: false,
            paid_execution_possible: true,
            paid_execution_running: true,
          },
        }).catch(() => null);
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
