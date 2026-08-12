export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import loadOrganizationPasskeyReadiness from "@/lib/people/workforce/passkeyRolloutReadiness";
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

    const [policy, passkeyReadiness] = await Promise.all([
      loadOrganizationPolicy({
        organizationId: context.organizationId,
      }),
      loadOrganizationPasskeyReadiness({
        organizationId: context.organizationId,
      }),
    ]);

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      role: context.role,
      policy,
      passkeyReadiness,
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

    const existingPolicy = await loadOrganizationPolicy({
      organizationId: context.organizationId,
    });
    const currentlyRequired =
      existingPolicy?.workforce?.passkey_clock_in_required === true;
    const requestedRequired =
      body?.workforce?.passkey_clock_in_required === true;

    if (requestedRequired && !currentlyRequired) {
      const passkeyReadiness = await loadOrganizationPasskeyReadiness({
        organizationId: context.organizationId,
      });

      if (!passkeyReadiness.activationReady) {
        return NextResponse.json(
          {
            success: false,
            code: "PASSKEY_ROLLOUT_NOT_READY",
            error:
              "Mandatory passkey clock-in cannot be enabled until rollout readiness is complete.",
            passkeyReadiness,
          },
          { status: 409 }
        );
      }
    }

    const policy = await saveOrganizationPolicy({
      organizationId: context.organizationId,
      access: body?.access || {},
      workforce: body?.workforce || {},
    });

    const passkeyReadiness = await loadOrganizationPasskeyReadiness({
      organizationId: context.organizationId,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      policy,
      passkeyReadiness,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to save policy" },
      { status: Number(error?.status) || 400 }
    );
  }
}
