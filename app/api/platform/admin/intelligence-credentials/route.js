export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";
import {
  ownedIntelligenceCredentialProvisioningStatus,
  provisionOwnedIntelligenceCredentialFromServerEnvironment,
} from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceCredentialProvisioningRuntime";

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

function safeProvisioningError(error) {
  const message = text(error?.message);
  const allowlisted = new Set([
    "organization_id required",
    "AVANTIQO_INTELLIGENCE_MODAL_TOKEN_ID_REQUIRED",
    "AVANTIQO_INTELLIGENCE_MODAL_TOKEN_SECRET_REQUIRED",
    "OWNED_INTELLIGENCE_CREDENTIAL_PROVISION_RESULT_INVALID",
  ]);

  if (allowlisted.has(message)) return message;
  if (message.startsWith("OWNED_INTELLIGENCE_CREDENTIAL_PROVISION_FAILED:")) {
    return message;
  }
  return "OWNED_INTELLIGENCE_CREDENTIAL_PROVISION_FAILED";
}

export async function GET(request) {
  try {
    const organizationId = organizationIdFromUrl(request);
    const access = await platformAccess(organizationId);
    if (!access.success) return accessFailure(access);

    const status = await ownedIntelligenceCredentialProvisioningStatus({
      organization_id: access.organizationId,
    });

    return Response.json({
      success: true,
      organization_id: access.organizationId,
      credential: status,
      secret_material_returned: false,
    });
  } catch {
    return Response.json(
      { success: false, error: "OWNED_INTELLIGENCE_CREDENTIAL_STATUS_FAILED" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const organizationId = organizationIdFromUrl(request);
    const access = await platformAccess(organizationId);
    if (!access.success) return accessFailure(access);

    const credential = await provisionOwnedIntelligenceCredentialFromServerEnvironment({
      organization_id: access.organizationId,
    });

    return Response.json({
      success: true,
      organization_id: access.organizationId,
      credential,
      secret_material_returned: false,
    });
  } catch (error) {
    const message = safeProvisioningError(error);
    const configurationMissing =
      message === "AVANTIQO_INTELLIGENCE_MODAL_TOKEN_ID_REQUIRED"
      || message === "AVANTIQO_INTELLIGENCE_MODAL_TOKEN_SECRET_REQUIRED";

    return Response.json(
      { success: false, error: message, secret_material_returned: false },
      { status: configurationMissing ? 409 : 500 },
    );
  }
}
