import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  AvantiqoCodeLocalQueueProvider,
} from "@/lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js";

const OPERATOR_PREWARM_CONTRACT = "AVANTIQO_CODE_OPERATOR_LOCAL_READINESS_V4";

function text(value) {
  return String(value ?? "").trim();
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id);
    if (!organizationId) {
      return Response.json(
        { success: false, error: "organization_id required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const localReady = await AvantiqoCodeLocalQueueProvider.available().catch(() => false);
    return Response.json({
      success: true,
      contract: OPERATOR_PREWARM_CONTRACT,
      status: localReady ? "local_ready" : "local_unavailable",
      ready: localReady,
      warming: false,
      reason: localReady
        ? "AVANTIQO_LOCAL_CODE_NODE_READY"
        : "AVANTIQO_LOCAL_CODE_NODE_UNAVAILABLE",
      execution_transport_mode: "AVANTIQO_LOCAL_NODE_V1",
      local_only: true,
      local_node_ready: localReady,
      external_compute_available: false,
      external_compute_checked: false,
      external_worker_started: false,
      worker_session_created: false,
      reasoning_calls_used: 0,
      customer_inference_performed: false,
      wallet_mutation_performed: false,
      source_mutation_performed: false,
      github_write_performed: false,
      production_deploy_performed: false,
      raw_reasoning_persisted: false,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        contract: OPERATOR_PREWARM_CONTRACT,
        status: "failed",
        ready: false,
        warming: false,
        error: text(error?.message || error).slice(0, 700) || "CODE_LOCAL_READINESS_FAILED",
        local_only: true,
        external_compute_available: false,
        external_compute_checked: false,
        external_worker_started: false,
        reasoning_calls_used: 0,
        customer_inference_performed: false,
        wallet_mutation_performed: false,
        source_mutation_performed: false,
        github_write_performed: false,
        production_deploy_performed: false,
        raw_reasoning_persisted: false,
      },
      { status: 500 },
    );
  }
}
