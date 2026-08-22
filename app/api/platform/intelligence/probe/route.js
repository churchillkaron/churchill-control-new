export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  getAvantiqoIntelligenceRuntimeConfiguration,
  probeAvantiqoIntelligenceRuntime,
} from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider";

const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function normalizedRole(value) {
  return text(value, 120).toUpperCase();
}

function errorResponse(error, status = 500) {
  return Response.json({ success: false, error }, { status });
}

async function ownerAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) {
    return { error: errorResponse(access.error, access.status || 403) };
  }
  if (!FULL_ACCESS_ROLES.has(normalizedRole(access.role))) {
    return {
      error: errorResponse(
        "Organization owner access is required to probe Synthetic Intelligence",
        403,
      ),
    };
  }
  return { access };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId =
      text(url.searchParams.get("organizationId"), 120) ||
      text(url.searchParams.get("organization_id"), 120);
    const resolved = await ownerAccess(request, organizationId);
    if (resolved.error) return resolved.error;

    return Response.json({
      success: true,
      configuration: getAvantiqoIntelligenceRuntimeConfiguration(),
    });
  } catch (error) {
    return errorResponse(
      error?.message || "Synthetic Intelligence configuration probe failed",
      error?.status || 500,
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(
      body.organizationId || body.organization_id,
      120,
    );
    const resolved = await ownerAccess(request, organizationId);
    if (resolved.error) return resolved.error;

    const probe = await probeAvantiqoIntelligenceRuntime();
    return Response.json({
      success: probe.success === true,
      configuration: getAvantiqoIntelligenceRuntimeConfiguration(),
      probe,
    }, {
      status: probe.success === true ? 200 : 502,
    });
  } catch (error) {
    return errorResponse(
      error?.message || "Synthetic Intelligence runtime probe failed",
      error?.status || 500,
    );
  }
}
