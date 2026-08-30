import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  AVANTIQO_LIVE_EXECUTION_CONTRACT,
  loadAvantiqoLiveExecution,
  requestAvantiqoLiveExecutionStop,
} from "@/lib/platform/runtime/AvantiqoLiveExecutionRuntime";
import {
  loadCodeAILiveProgress,
} from "@/lib/code/runtime/CodeAILiveProgressRuntime";

function text(value) {
  return String(value ?? "").trim();
}

async function authorizedContext(request, organizationId) {
  if (!organizationId) {
    return {
      error: Response.json(
        { success: false, error: "organization_id required" },
        { status: 400 },
      ),
    };
  }
  const access = await requireOrganizationAccess({
    organizationId,
    request,
  });
  if (!access.success) {
    return {
      error: Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      ),
    };
  }
  return {
    context: {
      organizationId: access.organizationId || organizationId,
      actor: {
        id: access.user?.id || access.userId || null,
      },
    },
  };
}

function eventTime(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function codeProjection(code) {
  const progress = code?.live_progress || null;
  if (!progress) return null;
  const event = progress.latest_event || {};
  return {
    contract: AVANTIQO_LIVE_EXECUTION_CONTRACT,
    execution_id: progress.mission_id || null,
    active: !["completed", "failed", "blocked", "cancelled"].includes(
      text(progress.state_status).toLowerCase(),
    ),
    status: progress.state_status || "running",
    stop_requested: false,
    updated_at: progress.updated_at || event.at || code.updated_at || null,
    latest_event: {
      at: event.at || progress.updated_at || null,
      lane: "code",
      phase: event.phase || "CODE_WORKING",
      status: event.status || progress.state_status || "running",
      description:
        event.description ||
        (event.action
          ? `Code is ${event.action.replaceAll("_", " ")}.`
          : "Code is working on the engineering mission."),
      capability_key: "platform.code_ai_autonomous.execute",
      operation_id: event.operation_id || progress.current_operation_id || null,
      action: event.action || null,
      files_changed: event.files_changed || progress.files_changed || [],
      command: event.command || progress.latest_test_command || null,
      command_args: event.command_args || progress.latest_test_args || [],
      read_only: ["inspect", "search", "read", "diff"].includes(text(event.action)),
      mutation_possible: ["apply_files", "delete_files", "rename_files"].includes(text(event.action)),
      mutation_running:
        ["apply_files", "delete_files", "rename_files"].includes(text(event.action)) &&
        text(event.status).toLowerCase() === "running",
      paid_execution_possible: ["PLANNING", "PLANNER_PENDING"].includes(text(event.phase).toUpperCase()),
      paid_execution_running: ["PLANNING", "PLANNER_PENDING"].includes(text(event.phase).toUpperCase()),
      verification_running: text(event.action) === "verify" && text(event.status).toLowerCase() === "running",
      verification_passed: event.verification_passed ?? progress.latest_verification_passed ?? null,
      reason: event.reason || null,
      raw_reasoning_persisted: false,
      source_content_persisted: false,
      secrets_persisted: false,
    },
    events: [],
    raw_reasoning_persisted: false,
    source_content_persisted: false,
    secrets_persisted: false,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id"),
    );
    const resolved = await authorizedContext(request, organizationId);
    if (resolved.error) return resolved.error;

    const [shared, code] = await Promise.all([
      loadAvantiqoLiveExecution({ context: resolved.context }),
      loadCodeAILiveProgress({ context: resolved.context }).catch(() => ({ found: false })),
    ]);
    const sharedProgress = shared?.live_execution || null;
    const codeProgress = codeProjection(code);
    const latest =
      codeProgress &&
      eventTime(codeProgress.updated_at) > eventTime(sharedProgress?.updated_at)
        ? codeProgress
        : sharedProgress;

    return Response.json({
      success: true,
      contract: AVANTIQO_LIVE_EXECUTION_CONTRACT,
      found: Boolean(latest),
      live_execution: latest || null,
      contains_raw_reasoning: false,
      contains_source_content: false,
      contains_secrets: false,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      success: false,
      contract: AVANTIQO_LIVE_EXECUTION_CONTRACT,
      error: text(error?.message || error).slice(0, 700) || "LIVE_EXECUTION_LOAD_FAILED",
    }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const organizationId = text(body.organizationId || body.organization_id);
    const resolved = await authorizedContext(request, organizationId);
    if (resolved.error) return resolved.error;
    const result = await requestAvantiqoLiveExecutionStop({
      context: resolved.context,
    });
    return Response.json({
      success: true,
      contract: AVANTIQO_LIVE_EXECUTION_CONTRACT,
      ...result,
      stop_is_cooperative: true,
      stop_boundary: "next_safe_execution_boundary",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      success: false,
      contract: AVANTIQO_LIVE_EXECUTION_CONTRACT,
      error: text(error?.message || error).slice(0, 700) || "LIVE_EXECUTION_STOP_FAILED",
    }, { status: 500 });
  }
}
