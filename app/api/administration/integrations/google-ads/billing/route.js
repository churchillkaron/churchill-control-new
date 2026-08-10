export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { GoogleAdsManagedBillingRuntime } from "@/lib/platform/service-runtime/providers/google/GoogleAdsManagedBillingRuntime";

const INTEGRATION_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
]);

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function canManageIntegrations(context) {
  const roles = [
    context?.role,
    context?.access?.role,
    context?.membership?.role,
    context?.staff?.role,
  ]
    .map((value) => upper(value))
    .filter(Boolean);

  return roles.some((role) => INTEGRATION_ROLES.has(role));
}

async function resolveContext(request, body = {}) {
  const url = new URL(request.url);
  return requireOrganizationAccess({
    organizationId:
      body.organizationId ||
      body.organization_id ||
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id"),
    request,
  });
}

function forbidden() {
  return NextResponse.json(
    {
      success: false,
      error: "Owner, administrator, or manager access is required to manage Google Ads",
    },
    { status: 403 }
  );
}

export async function GET(request) {
  try {
    const context = await resolveContext(request);
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 403 }
      );
    }
    if (!canManageIntegrations(context)) return forbidden();

    const status = await GoogleAdsManagedBillingRuntime.getStatus({
      organizationId: context.organizationId,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      ...status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load managed Google Ads billing status",
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const context = await resolveContext(request, body);
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 403 }
      );
    }
    if (!canManageIntegrations(context)) return forbidden();

    const action = text(body.action).toLowerCase();
    if (action !== "attach-managed-billing") {
      return NextResponse.json(
        { success: false, error: "Unsupported managed Google Ads billing action" },
        { status: 400 }
      );
    }

    const result = await GoogleAdsManagedBillingRuntime.attach({
      organizationId: context.organizationId,
      assetId: text(body.assetId || body.asset_id) || null,
    });

    return NextResponse.json({
      success: true,
      message: result.created
        ? "Avantiqo Google billing setup created for the managed advertiser."
        : "Avantiqo Google billing is already attached to the managed advertiser.",
      organizationId: context.organizationId,
      ...result,
    });
  } catch (error) {
    const message = error?.message || "Unable to attach managed Google Ads billing";
    const platformBlocker = message.startsWith("AVANTIQO_GOOGLE_ADS_");

    return NextResponse.json(
      {
        success: false,
        error: platformBlocker
          ? "Avantiqo Google billing is not ready yet. This is a platform setup issue; the customer does not need to configure Google."
          : message,
        code: message,
      },
      { status: platformBlocker ? 409 : 500 }
    );
  }
}
