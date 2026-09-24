import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  AVANTIQO_LIVE_EXECUTION_CONTRACT,
  loadAvantiqoLiveExecution,
  requestAvantiqoLiveExecutionStop,
} from "@/lib/platform/runtime/AvantiqoLiveExecutionRuntime";

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

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id"),
    );
    const resolved = await authorizedContext(request, organizationId);
    if (resolved.error) return resolved.error;

    const shared = await loadAvantiqoLiveExecution({ context: resolved.context });
    const sharedProgress = shared?.live_execution || null;
    const liveExecution = sharedProgress
      ? (() => {
          const progress = sharedProgress;
          const events = Array.isArray(progress.events) ? progress.events.filter(Boolean) : [];
          const latestEvent = progress.latest_event || {
            status: progress.status || "running",
            description: progress.description || progress.message || "Code execution is active.",
            updated_at: progress.updated_at || shared?.updated_at || null,
          };
          const terminal = ["completed", "failed", "blocked", "cancelled", "stopped"].includes(
            text(progress.status).toLowerCase(),
          );
          return {
            ...sharedProgress,
            active: terminal ? false : progress.active !== false,
            events: events.length ? events : [latestEvent],
            latest_event: latestEvent,
            stop_execution_id: progress.execution_id || null,
            intelligence_product: "business_partner",
          };
        })()
      : null;

    return Response.json({
      success: true,
      contract: AVANTIQO_LIVE_EXECUTION_CONTRACT,
      found: Boolean(liveExecution),
      live_execution: liveExecution,
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
    const executionId = text(body.executionId || body.execution_id);
    if (!executionId) {
      return Response.json({
        success: false,
        contract: AVANTIQO_LIVE_EXECUTION_CONTRACT,
        error: "execution_id required",
      }, { status: 400 });
    }
    const resolved = await authorizedContext(request, organizationId);
    if (resolved.error) return resolved.error;
    const result = await requestAvantiqoLiveExecutionStop({
      context: resolved.context,
      executionId,
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
