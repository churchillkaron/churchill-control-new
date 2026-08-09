export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";

function errorResponse(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId =
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id") ||
      null;

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const pageId = url.searchParams.get("page_id");
    const assets = [];

    if (pageId) {
      const page = await ChannelAssetRuntime.find({
        organization_id: access.organizationId,
        provider: "meta",
        asset_type: "facebook_page",
        external_id: pageId,
      }).catch(() => null);

      if (page) {
        assets.push(page);
      }
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      accounts: assets,
    });
  } catch (error) {
    return errorResponse(error?.message || "Meta account lookup failed");
  }
}
