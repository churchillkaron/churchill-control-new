export const runtime = "nodejs";

import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";
import { getAvantiqoIntelligenceRuntimeConfiguration } from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider";

function text(value) {
  return String(value ?? "").trim();
}

function organizationIdFromUrl(request) {
  const url = new URL(request.url);
  return text(
    url.searchParams.get("organization_id") || url.searchParams.get("organizationId"),
  );
}

async function platformAccess(organizationId) {
  return requirePlatformOperatorWorkspaceAccess({ organizationId });
}

function accessFailure(access) {
  return Response.json(
    { success: false, error: access.error || "Platform operator access required" },
    { status: access.status || 403 },
  );
}

export async function GET(request) {
  const organizationId = organizationIdFromUrl(request);
  const access = await platformAccess(organizationId);
  if (!access.success) return accessFailure(access);

  const runtimeConfig = getAvantiqoIntelligenceRuntimeConfiguration();
  return Response.json({
    success: true,
    organization_id: access.organizationId,
    intelligence_runtime: {
      mode: "LOCAL_FIRST_WITH_GOVERNED_MODAL_OVERFLOW",
      credential_required: false,
      external_compute_allowed: false,
      governed_modal_overflow_supported: runtimeConfig.governed_modal_overflow_supported === true,
      governed_modal_overflow_available: runtimeConfig.governed_modal_overflow_available === true,
      modal_overflow_server_credentials_managed: true,
      modal_overflow_approval_required: true,
      automatic_modal_fallback_allowed: false,
      provider: "avantiqo-intelligence",
    },
    secret_material_returned: false,
  });
}

export async function POST(request) {
  const organizationId = organizationIdFromUrl(request);
  const access = await platformAccess(organizationId);
  if (!access.success) return accessFailure(access);

  const runtimeConfig = getAvantiqoIntelligenceRuntimeConfiguration();
  return Response.json(
    {
      success: false,
      organization_id: access.organizationId,
      error: "AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_CREDENTIALS_SERVER_MANAGED",
      intelligence_runtime: {
        mode: "LOCAL_FIRST_WITH_GOVERNED_MODAL_OVERFLOW",
        credential_required: false,
        external_compute_allowed: false,
        governed_modal_overflow_supported: runtimeConfig.governed_modal_overflow_supported === true,
        governed_modal_overflow_available: runtimeConfig.governed_modal_overflow_available === true,
        modal_overflow_approval_required: true,
        automatic_modal_fallback_allowed: false,
      },
      secret_material_returned: false,
    },
    { status: 410 },
  );
}
