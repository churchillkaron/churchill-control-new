export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  isCreativeVisualAsset,
  isVideoAsset,
  resolveCreativeAssetPreviewUrl,
} from "@/lib/marketing/services/resolveCreativeAssetPreviewUrl";

async function requireCampaign({ organizationId, campaignId, request }) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) {
    return { error: Response.json(access, { status: access.status || 403 }) };
  }

  const { data: campaign, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("id,organization_id,campaign_name")
    .eq("id", campaignId)
    .eq("organization_id", access.organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!campaign) {
    return {
      error: Response.json(
        { success: false, error: "Campaign not found for this organization" },
        { status: 404 },
      ),
    };
  }

  return { access, campaign };
}

function cleanSearch(value) {
  return String(value || "")
    .trim()
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 100);
}

async function serializeAsset(asset, attachedAssetIds, campaignId) {
  const previewUrl = await resolveCreativeAssetPreviewUrl(asset);

  return {
    id: asset.id,
    name: asset.name || asset.file_name || "Creative asset",
    file_name: asset.file_name || null,
    asset_type: asset.asset_type || "creative",
    source_type: asset.source_type || null,
    campaign_id: asset.campaign_id || null,
    mime_type: asset.mime_type || null,
    status: asset.status || null,
    approval_state: asset.approval_state || null,
    created_at: asset.created_at || null,
    preview_url: previewUrl,
    is_video: isVideoAsset(asset),
    attached: attachedAssetIds.has(asset.id) || asset.campaign_id === campaignId,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = String(body?.action || "search").toLowerCase();
    const organizationId = body?.organizationId;
    const campaignId = body?.campaignId;

    if (!organizationId || !campaignId) {
      return Response.json(
        { success: false, error: "organizationId and campaignId are required" },
        { status: 400 },
      );
    }

    const context = await requireCampaign({ organizationId, campaignId, request });
    if (context.error) return context.error;

    if (action === "attach") {
      const assetId = body?.assetId;
      if (!assetId) {
        return Response.json(
          { success: false, error: "assetId is required" },
          { status: 400 },
        );
      }

      const { data: asset, error: assetError } = await supabaseAdmin
        .from("creative_assets")
        .select("id,organization_id,archived,asset_type,mime_type,name,file_name,file_url,image_url,thumbnail_url,uri")
        .eq("id", assetId)
        .eq("organization_id", context.access.organizationId)
        .maybeSingle();

      if (assetError) throw assetError;
      if (!asset || asset.archived === true || !isCreativeVisualAsset(asset)) {
        return Response.json(
          { success: false, error: "Visual asset not found for this organization" },
          { status: 404 },
        );
      }

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("campaign_asset_usage")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("asset_id", assetId)
        .eq("organization_id", context.access.organizationId)
        .maybeSingle();

      if (existingError) throw existingError;

      if (!existing) {
        const { error: insertError } = await supabaseAdmin
          .from("campaign_asset_usage")
          .insert({
            campaign_id: campaignId,
            asset_id: assetId,
            organization_id: context.access.organizationId,
          });

        if (insertError) throw insertError;
      }

      return Response.json({ success: true, data: { attached: true, assetId } });
    }

    if (action !== "search") {
      return Response.json(
        { success: false, error: "Unsupported action" },
        { status: 400 },
      );
    }

    const query = cleanSearch(body?.query);

    let assetQuery = supabaseAdmin
      .from("creative_assets")
      .select("id,organization_id,campaign_id,asset_type,source_type,name,file_name,file_url,image_url,thumbnail_url,uri,mime_type,status,approval_state,archived,created_at")
      .eq("organization_id", context.access.organizationId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (query) {
      assetQuery = assetQuery.or(
        `name.ilike.%${query}%,file_name.ilike.%${query}%,asset_type.ilike.%${query}%`,
      );
    }

    const [{ data: assets, error: assetsError }, { data: usage, error: usageError }] =
      await Promise.all([
        assetQuery,
        supabaseAdmin
          .from("campaign_asset_usage")
          .select("asset_id")
          .eq("campaign_id", campaignId)
          .eq("organization_id", context.access.organizationId),
      ]);

    if (assetsError) throw assetsError;
    if (usageError) throw usageError;

    const attachedAssetIds = new Set((usage || []).map((row) => row.asset_id));
    const visualAssets = (assets || []).filter(isCreativeVisualAsset);
    const serialized = await Promise.all(
      visualAssets.map((asset) => serializeAsset(asset, attachedAssetIds, campaignId)),
    );

    return Response.json({
      success: true,
      data: {
        assets: serialized.filter((asset) => asset.preview_url),
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Campaign asset request failed" },
      { status: 500 },
    );
  }
}
