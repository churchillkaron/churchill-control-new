import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  withOwnedIntelligenceRequestLease,
} from "@/lib/platform/service-runtime/execution/OwnedIntelligenceRequestLeaseRuntime";
import {
  prewarmAvantiqoIntelligenceFastEndpoint,
} from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceFastProvider";

const CONTRACT = "AVANTIQO_INTELLIGENCE_OPERATOR_PREWARM_V1";

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

    const result = await withOwnedIntelligenceRequestLease({
      provider: "avantiqo-intelligence",
      organizationId,
      capability: "ai.text.generate",
      payload: { execution_lane: "fast" },
      execute: async (leaseContext) => prewarmAvantiqoIntelligenceFastEndpoint({
        context: {
          organization_id: organizationId,
          ...leaseContext,
        },
      }),
    });

    return Response.json({
      success: result?.success === true,
      contract: CONTRACT,
      status: result?.status || "warming",
      ready: result?.status === "ready",
      already_warm: result?.already_warm === true,
      warmup_latency_ms: Number(result?.latency_ms || 0),
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
      error: text(error?.message || error).slice(0, 700) || "INTELLIGENCE_PREWARM_FAILED",
      customer_inference_performed: false,
      wallet_mutation_performed: false,
      source_mutation_performed: false,
      production_deploy_performed: false,
    }, { status: 500 });
  }
}
