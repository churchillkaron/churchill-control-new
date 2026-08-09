export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { resolveOrganizationChannels } from "@/lib/platform/channels/resolver/ChannelConnectionResolver";
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = cleanValue(
      searchParams.get("organization_id") ||
      searchParams.get("organizationId"),
    );

    if (!organizationId) {
      return errorResponse("organization_id required", 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const channels = await resolveOrganizationChannels({
      organization_id: access.organizationId,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      rows: channels,
    });
  } catch (error) {
    console.error("PLATFORM_CHANNELS_GET_ERROR", error);
    return errorResponse(error?.message || "Channel lookup failed");
  }
}
