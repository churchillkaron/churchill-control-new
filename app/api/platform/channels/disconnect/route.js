export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

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
