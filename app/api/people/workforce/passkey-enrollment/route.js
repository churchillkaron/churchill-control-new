export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import provisionPasskeyEnrollmentAccess from "@/lib/people/workforce/provisionPasskeyEnrollmentAccess";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

const MANAGE_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
]);

const WORKFORCE_CANONICAL_ORIGIN = "https://avantiqo.ai";
const WORKFORCE_ENROLLMENT_REDIRECT = `${WORKFORCE_CANONICAL_ORIGIN}/workforce/profile`;

function roleOf(value) {
  return String(value || "").trim().toUpperCase();
}

function contextFailure(context) {
  return NextResponse.json(
    {
      success: false,
      error: context.error,
      code: context.code,
      availableOrganizationIds: context.availableOrganizationIds || [],
    },
    { status: context.status || 403 }
  );
}

async function managementContext(request, organizationId) {
  const context = await resolveAuthenticatedStaffContext({
    request,
    organizationId,
  });

  if (!context.success) return { response: contextFailure(context) };

  const role = roleOf(context.role || context.staff?.role);
  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: "Workforce enrollment management permission required",
        },
        { status: 403 }
      ),
    };
  }

  return {
    organizationId: context.organizationId,
    role,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId =
      String(body?.organizationId || body?.organization_id || "").trim() || null;
    const staffId = String(body?.staffId || body?.staff_id || "").trim() || null;

    const context = await managementContext(request, organizationId);
    if (context.response) return context.response;

    if (!staffId) {
      return NextResponse.json(
        { success: false, error: "staffId required" },
        { status: 400 }
      );
    }

    const result = await provisionPasskeyEnrollmentAccess({
      organizationId: context.organizationId,
      staffId,
      redirectTo: WORKFORCE_ENROLLMENT_REDIRECT,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      canonicalOrigin: WORKFORCE_CANONICAL_ORIGIN,
      redirectTo: WORKFORCE_ENROLLMENT_REDIRECT,
      ...result,
    });
  } catch (error) {
    console.error("WORKFORCE_PASSKEY_ENROLLMENT_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to send passkey enrollment access",
        code: error?.code || null,
      },
      { status: Number(error?.status) || 400 }
    );
  }
}
