export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PERMISSIONS = [
  "marketing.campaign.create",
  "marketing.campaign.manage",
  "marketing.*",
];

function text(value) {
  return String(value ?? "").trim();
}

function providerOutput(result = {}) {
  return result?.output?.output || result?.output || {};
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId"));
    const accountAssetId = text(url.searchParams.get("accountAssetId"));
    if (!organizationId || !accountAssetId) {
      return NextResponse.json({ success: false, error: "organizationId and accountAssetId are required" }, { status: 400 });
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: PERMISSIONS,
    });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error || "Organization access denied" }, { status: access.status || 403 });
    }

    const { data: asset, error: assetError } = await supabaseAdmin
      .from("organization_channel_assets")
      .select("id,organization_id,channel_provider,asset_type,external_id,name,entity_id,metadata")
      .eq("id", accountAssetId)
      .eq("organization_id", access.organizationId)
      .eq("channel_provider", "tiktok")
      .eq("asset_type", "tiktok_account")
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset) {
      return NextResponse.json({ success: false, error: "TikTok account is not available for this organization" }, { status: 404 });
    }

    const execution = await executeService({
      organization_id: access.organizationId,
      entity_id: asset.entity_id || null,
      service_id: "tiktok",
      provider_id: "tiktok",
      capability: "marketing.tiktok.creator.read",
      input: {},
      category: "MARKETING_CAMPAIGN_PREFLIGHT",
      metadata: {
        campaign_tiktok_creator_preflight: true,
        account_asset_id: asset.id,
      },
    });
    const creator = providerOutput(execution);

    return NextResponse.json({
      success: true,
      data: {
        account: {
          id: asset.id,
          name: asset.name || asset.external_id || "TikTok",
          external_id: asset.external_id || null,
        },
        creator: {
          creator_username: text(creator.creator_username || creator.username) || null,
          creator_nickname: text(creator.creator_nickname || creator.display_name) || null,
          privacy_level_options: Array.isArray(creator.privacy_level_options)
            ? creator.privacy_level_options.map(text).filter(Boolean)
            : [],
          comment_disabled: creator.comment_disabled === true,
          duet_disabled: creator.duet_disabled === true,
          stitch_disabled: creator.stitch_disabled === true,
          max_video_post_duration_sec: Number.isFinite(Number(creator.max_video_post_duration_sec))
            ? Number(creator.max_video_post_duration_sec)
            : null,
        },
        usage_id: execution?.usage?.id || null,
        zero_price: Number(execution?.pricing?.customer_price || 0) === 0,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load TikTok creator publishing options" },
      { status: error?.status || 500 },
    );
  }
}
