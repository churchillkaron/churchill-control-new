export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  checkGeminiReadiness,
} from "@/lib/platform/service-runtime/providers/gemini/GeminiReadinessRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function statusFor(error) {
  const message = text(error?.message).toUpperCase();
  if (message.includes("AUTHENTICATION")) return 401;
  if (message.includes("PERMISSION") || message.includes("MEMBERSHIP")) return 403;
  if (
    message.includes("REQUIRED") ||
    message.includes("INVALID") ||
    message.includes("MISMATCH")
  ) return 400;
  if (message.includes("READINESS_FAILED")) return 502;
  return 500;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(
      body.organization_id || body.organizationId,
    );

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: [
        "creative.*",
        "creative.execute",
      ],
    });

    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const result = await checkGeminiReadiness({
      organization_id: organizationId,
    });

    return Response.json({
      ...result,
      organization_id: organizationId,
      requested_by: access.userId || access.user?.id || null,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        ready: false,
        generation_requested: false,
        media_generated: false,
        wallet_used: false,
        billable_generation_authorized: false,
        error: error?.message || String(error),
      },
      { status: statusFor(error) },
    );
  }
}
