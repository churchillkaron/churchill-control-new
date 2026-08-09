export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

function errorResponse(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId =
      body.organizationId ||
      body.organization_id ||
      null;

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const accessToken = body.access_token || body.accessToken || null;
    const pageName = body.page_name || body.pageName || null;
    const pageId = body.page_id || body.pageId || null;
    const instagramBusinessId =
      body.instagram_business_id ||
      body.instagramBusinessId ||
      null;

    if (!accessToken) {
      return errorResponse("access_token required", 400);
    }

    if (!pageId) {
      return errorResponse("page_id required", 400);
    }

    const credential = await CredentialRuntime.store({
      provider_id: "meta",
      credential_type: "oauth_token",
      secret_reference: accessToken,
      metadata: {
        page_id: pageId,
        page_name: pageName,
      },
    });

    await ChannelConnectionRuntime.connect({
      organization_id: access.organizationId,
      provider: "meta",
      channel_type: "social",
      credentials_reference: credential.id,
      metadata: {
        page_id: pageId,
        instagram_business_id: instagramBusinessId,
      },
    });

    const connection = await ChannelConnectionRuntime.get({
      organization_id: access.organizationId,
      provider: "meta",
    });

    if (!connection) {
      return errorResponse("Meta connection could not be created", 500);
    }

    await ChannelAssetRuntime.register({
      organization_id: access.organizationId,
      connection_id: connection.id,
      provider: "meta",
      asset_type: "facebook_page",
      external_id: pageId,
      name: pageName || pageId,
      metadata: {
        instagram_business_id: instagramBusinessId,
      },
    });

    if (instagramBusinessId) {
      await ChannelAssetRuntime.register({
        organization_id: access.organizationId,
        connection_id: connection.id,
        provider: "meta",
        asset_type: "instagram_business",
        external_id: instagramBusinessId,
        name: pageName || instagramBusinessId,
      });
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      account: {
        page_id: pageId,
        page_name: pageName,
        instagram_business_id: instagramBusinessId,
      },
    });
  } catch (error) {
    console.error("META_SAVE_ACCOUNT_ERROR", error);
    return errorResponse(error?.message || "Save account failed", error?.status || 500);
  }
}
