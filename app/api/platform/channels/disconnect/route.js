export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGER_ROLES = new Set(["OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN","ADMIN","MANAGER"]);

function cleanValue(value) {
  const normalized = String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }

  return normalized;
}

function errorResponse(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status },
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = cleanValue(
      body.organization_id || body.organizationId,
    );
    const provider = cleanValue(body.provider);

    if (!organizationId) {
      return errorResponse("organization_id required", 400);
    }

    if (!provider) {
      return errorResponse("provider required", 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const roles = [access.role, access?.access?.role, access?.membership?.role, access?.staff?.role]
      .map((value) => String(value || "").trim().toUpperCase())
      .filter(Boolean);
    if (!roles.some((role) => MANAGER_ROLES.has(role))) {
      return errorResponse("Owner, administrator, or manager access is required to disconnect business channels", 403);
    }

    const existing = await ChannelConnectionRuntime.get({
      organization_id: access.organizationId,
      provider,
    }).catch(() => null);

    if (existing?.credentials_reference) {
      const credentialUpdate = await supabaseAdmin
        .from("provider_credentials")
        .update({ status: "INACTIVE", updated_at: new Date().toISOString() })
        .eq("id", existing.credentials_reference)
        .eq("provider_id", provider)
        .eq("status", "ACTIVE");
      if (credentialUpdate.error) throw credentialUpdate.error;
    }

    const connection = await ChannelConnectionRuntime.disconnect({
      organization_id: access.organizationId,
      provider,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      connection,
    });
  } catch (error) {
    console.error("CHANNEL_DISCONNECT_ERROR", error);
    return errorResponse(error?.message || "Channel disconnect failed");
  }
}
