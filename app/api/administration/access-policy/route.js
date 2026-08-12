export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  loadOrganizationPolicy,
  saveOrganizationPolicy,
} from "@/lib/platform/security/organizationAccessPolicy";

const MANAGE_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
]);

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

async function policyContext(request, organizationId) {
  const context = await resolveAuthenticatedStaffContext({
    request,
    organizationId,
  });

  if (!context.success) return { response: contextFailure(context) };

  const role = roleOf(context.role || context.staff?.role);
  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Organization policy permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    organizationId: context.organizationId,
    role,
    staff: context.staff,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const requestedOrganizationId =
      String(url.searchParams.get("organizationId") || "").trim() || null;
    const context = await policyContext(request, requestedOrganizationId);
    if (context.response) return context.response;

    const policy = await loadOrganizationPolicy({
      organizationId: context.organizationId,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      role: context.role,
      policy,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load policy" },
      { status: 400 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId =
      String(body?.organizationId || body?.organization_id || "").trim() || null;
    const context = await policyContext(request, requestedOrganizationId);
    if (context.response) return context.response;

    const policy = await saveOrganizationPolicy({
      organizationId: context.organizationId,
      access: body?.access || {},
      workforce: body?.workforce || {},
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      policy,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to save policy" },
      { status: 400 }
    );
  }
}
