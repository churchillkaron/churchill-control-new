export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import {
  instagramAccountProvisioningCapability,
  prepareInstagramAccountProvisioning,
} from "@/lib/platform/channels/meta/InstagramAccountProvisioningRuntime";

function clean(value) {
  const normalized = String(value ?? "").trim();
  return normalized && normalized !== "undefined" && normalized !== "null" ? normalized : null;
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

async function organizationAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) {
    const error = new Error(access.error || "Organization access denied");
    error.status = access.status || 403;
    throw error;
  }
  return access;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    );
    const access = await organizationAccess(request, organizationId);
    const connection = await ChannelConnectionRuntime.get({
      organization_id: access.organizationId,
      provider: "meta",
    });
    const assets = connection
      ? await ChannelAssetRuntime.list({
          organization_id: access.organizationId,
          connection_id: connection.id,
        })
      : [];
    const instagramAccounts = assets.filter(
      (asset) => asset.asset_type === "instagram_business",
    );

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      capability: instagramAccountProvisioningCapability(),
      meta_connected: Boolean(connection && connection.status === "ACTIVE"),
      instagram_accounts: instagramAccounts,
    });
  } catch (error) {
    return errorResponse(error?.message || "Instagram provisioning status failed", error?.status || 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const access = await organizationAccess(request, organizationId);

    const connection = await ChannelConnectionRuntime.get({
      organization_id: access.organizationId,
      provider: "meta",
    });

    if (!connection || connection.status !== "ACTIVE") {
      return NextResponse.json(
        {
          success: true,
          organizationId: access.organizationId,
          status: "META_AUTHORIZATION_REQUIRED",
          connect_url: `/api/meta/auth?organizationId=${encodeURIComponent(access.organizationId)}`,
          capability: instagramAccountProvisioningCapability(),
        },
        { status: 200 },
      );
    }

    const provisioning = prepareInstagramAccountProvisioning({
      organizationId: access.organizationId,
      username: body.username,
      displayName: body.displayName || body.display_name,
      bio: body.bio,
      website: body.website,
    });

    return NextResponse.json({
      success: true,
      ...provisioning,
    });
  } catch (error) {
    return errorResponse(error?.message || "Instagram provisioning failed", error?.status || 500);
  }
}
