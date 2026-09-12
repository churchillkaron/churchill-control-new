import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  getAvantiqoIntelligenceRuntimeConfiguration,
} from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider";
import {
  prewarmIntelligenceModalFront,
} from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime";

const CONTRACT = "AVANTIQO_INTELLIGENCE_OPERATOR_PREWARM_V2";

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
    const warmed = await prewarmIntelligenceModalFront();
    return Response.json({
      success: true,
      contract: CONTRACT,
      status: "ready",
      ready: warmed.ready === true,
      already_warm: false,
      warmup_latency_ms: Number(warmed.latency_ms || 0),
      infrastructure_provider: warmed.infrastructure_provider || "MODAL_CPU_SNAPSHOT_V1",
      model: warmed.model || runtime.front_model || null,
      front_runtime_contract: warmed.runtime_contract || null,
      modal_only: runtime.modal_only === true,
      scale_to_zero: runtime.scale_to_zero === true,
      min_containers: 0,
      scaledown_window_seconds: 120,
      prewarm_required: true,
      customer_inference_performed: false,
      wallet_mutation_performed: false,
      source_mutation_performed: false,
      production_deploy_performed: false,
    });
  } catch (error) {
    return Response.json({
      success: false,
      contract: CONTRACT,
      status: "failed",
      ready: false,
      error: text(error?.message || error).slice(0, 700) || "INTELLIGENCE_PREWARM_STATUS_FAILED",
      customer_inference_performed: false,
      wallet_mutation_performed: false,
      source_mutation_performed: false,
      production_deploy_performed: false,
    }, { status: 500 });
  }
}
