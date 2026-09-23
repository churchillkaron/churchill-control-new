import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  getAvantiqoIntelligenceEndpointHealthForLane,
  getAvantiqoIntelligenceRuntimeConfiguration,
} from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider";
import {
  getIntelligenceLocalQueueHealth,
} from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js";

const CONTRACT = "AVANTIQO_INTELLIGENCE_OPERATOR_PREWARM_V3";
const LOCAL_PREWARM_CONTRACT = "AVANTIQO_INTELLIGENCE_LOCAL_READINESS_V1";

function text(value) {
  return String(value ?? "").trim();
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id);
    if (!organizationId) {
      return Response.json({ success: false, error: "organization_id required" }, { status: 400 });
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return Response.json({ success: false, error: access.error }, { status: access.status || 403 });
    }

    const runtime = getAvantiqoIntelligenceRuntimeConfiguration();
    const startedAt = Date.now();
    const health = await getIntelligenceLocalQueueHealth({
      local_compute_required: true,
      infrastructure_policy: "local_only",
    });
    const latencyMs = Math.max(0, Date.now() - startedAt);

    return Response.json({
      success: true,
      contract: CONTRACT,
      local_readiness_contract: LOCAL_PREWARM_CONTRACT,
      status: health.ready === true ? "ready" : "local_unavailable",
      ready: health.ready === true,
      already_warm: health.ready === true,
      warmup_latency_ms: latencyMs,
      infrastructure_provider: health.infrastructure_provider || "AVANTIQO_LOCAL_NODE_V1",
      transport: health.transport || null,
      online_nodes: Number(health.online_nodes || 0),
      model: runtime.front_model || null,
      local_only_preflight: true,
      external_compute_available: false,
      external_compute_started: false,
      inference_requests_performed: 0,
      customer_inference_performed: false,
      wallet_mutation_performed: false,
      source_mutation_performed: false,
      production_deploy_performed: false,
    });
  } catch (error) {
    return Response.json({
      success: false,
      contract: CONTRACT,
      local_readiness_contract: LOCAL_PREWARM_CONTRACT,
      status: "failed",
      ready: false,
      error: text(error?.message || error).slice(0, 700) || "INTELLIGENCE_LOCAL_READINESS_FAILED",
      local_only_preflight: true,
      external_compute_available: false,
      external_compute_started: false,
      inference_requests_performed: 0,
      customer_inference_performed: false,
      wallet_mutation_performed: false,
      source_mutation_performed: false,
      production_deploy_performed: false,
    }, { status: 500 });
  }
}
