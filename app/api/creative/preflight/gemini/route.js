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

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

async function runReadiness(request, organizationId) {
  const resolvedOrganizationId = text(organizationId);

  const access = await requireOrganizationAccess({
    organizationId: resolvedOrganizationId,
    request,
    requiredAnyPermission: [
      "creative.*",
      "creative.execute",
    ],
  });

  if (!access.success) {
    return json(access, access.status);
  }

  const result = await checkGeminiReadiness({
    organization_id: resolvedOrganizationId,
  });

  return json({
    ...result,
    organization_id: resolvedOrganizationId,
    requested_by: access.userId || access.user?.id || null,
  });
}

function failure(error) {
  return json(
    {
      success: false,
      ready: false,
      generation_requested: false,
      media_generated: false,
      wallet_used: false,
      billable_generation_authorized: false,
      secret_exposed: false,
      error: error?.message || String(error),
    },
    statusFor(error),
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    return await runReadiness(
      request,
      url.searchParams.get("organization_id") ||
        url.searchParams.get("organizationId"),
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    return await runReadiness(
      request,
      body.organization_id || body.organizationId,
    );
  } catch (error) {
    return failure(error);
  }
}
