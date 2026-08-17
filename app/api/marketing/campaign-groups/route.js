export const dynamic = "force-dynamic";

import { withApiHandler } from "@/lib/shared/http/withApiHandler";
import { requireFields } from "@/lib/shared/validation/required";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { canUseMultiOrganizationMarketing } from "@/lib/marketing/security/marketingCampaignAccess";
import {
  isCreativeVisualAsset,
  isVideoAsset,
  resolveCreativeAssetPreviewUrl,
} from "@/lib/marketing/services/resolveCreativeAssetPreviewUrl";

function approvalValue(asset) {
  return String(asset?.approval_state || asset?.status || "").toLowerCase();
}

async function serializeAsset(asset) {
  if (!isCreativeVisualAsset(asset)) return null;
  const previewUrl = await resolveCreativeAssetPreviewUrl(asset);
  if (!previewUrl) return null;

  return {
    id: asset.id,
    name: asset.name || asset.file_name || "Creative asset",
    file_name: asset.file_name || null,
    asset_type: asset.asset_type || "creative",
    source_type: asset.source_type || null,
    mime_type: asset.mime_type || null,
    status: asset.status || null,
    approval_state: asset.approval_state || null,
    metadata: asset.metadata || {},
    created_at: asset.created_at || null,
    preview_url: previewUrl,
    is_video: isVideoAsset(asset),
  };
}

export const POST = withApiHandler(
  "marketing-campaign-groups",
  async (request) => {
    const body = await request.json();
    requireFields(body, ["organizationId"]);

    const ownerAccess = await requireOrganizationAccess({
      organizationId: body.organizationId,
      request,
    });

    if (!ownerAccess.success) {
      const error = new Error(ownerAccess.error || "Organization access denied");
      error.status = ownerAccess.status || 403;
      throw error;
    }

    if (!canUseMultiOrganizationMarketing(ownerAccess)) {
      const error = new Error("Multi-organization Marketing permission required");
      error.status = 403;
      throw error;
    }

    const { data: groups, error: groupsError } = await supabaseAdmin
      .from("marketing_campaign_groups")
      .select("*")
      .eq("organization_id", ownerAccess.organizationId)
      .order("created_at", { ascending: false });

    if (groupsError) throw groupsError;
    if (!groups?.length) return { groups: [] };

    const groupIds = groups.map((group) => group.id);
    const { data: members, error: membersError } = await supabaseAdmin
      .from("marketing_campaign_group_members")
      .select("*")
      .in("campaign_group_id", groupIds)
      .eq("member_status", "active")
      .order("sequence_no", { ascending: true });

    if (membersError) throw membersError;

    const organizationIds = [
      ...new Set((members || []).map((member) => member.organization_id).filter(Boolean)),
    ];
    const accessibleOrganizations = new Set();

    for (const organizationId of organizationIds) {
      const access = await requireOrganizationAccess({ organizationId, request });
      if (access.success) accessibleOrganizations.add(organizationId);
    }

    const membersByRawGroup = new Map();
    for (const member of members || []) {
      if (!membersByRawGroup.has(member.campaign_group_id)) {
        membersByRawGroup.set(member.campaign_group_id, []);
      }
      membersByRawGroup.get(member.campaign_group_id).push(member);
    }

    const fullyAccessibleGroups = groups.filter((group) => {
      const groupMembers = membersByRawGroup.get(group.id) || [];
      return (
        groupMembers.length > 0 &&
        groupMembers.every((member) => accessibleOrganizations.has(member.organization_id))
      );
    });

    if (!fullyAccessibleGroups.length) return { groups: [] };

    const visibleGroupIds = fullyAccessibleGroups.map((group) => group.id);
    const visibleMembers = (members || []).filter((member) =>
      visibleGroupIds.includes(member.campaign_group_id),
    );
    const campaignIds = visibleMembers
      .map((member) => member.marketing_campaign_id)
      .filter(Boolean);
    const visibleOrganizationIds = [
      ...new Set(visibleMembers.map((member) => member.organization_id).filter(Boolean)),
    ];

    const [campaignResult, organizationResult, directAssetResult, usageResult] =
      await Promise.all([
        campaignIds.length
          ? supabaseAdmin.from("marketing_campaigns").select("*").in("id", campaignIds)
          : Promise.resolve({ data: [], error: null }),
        visibleOrganizationIds.length
          ? supabaseAdmin
              .from("organizations")
              .select("id,name,organization_type,status")
              .in("id", visibleOrganizationIds)
          : Promise.resolve({ data: [], error: null }),
        campaignIds.length
          ? supabaseAdmin
              .from("creative_assets")
              .select(
                "id,campaign_id,organization_id,asset_type,source_type,name,file_name,file_url,image_url,thumbnail_url,uri,mime_type,status,approval_state,metadata,archived,created_at",
              )
              .in("campaign_id", campaignIds)
          : Promise.resolve({ data: [], error: null }),
        campaignIds.length
          ? supabaseAdmin
              .from("campaign_asset_usage")
              .select("campaign_id,asset_id,organization_id")
              .in("campaign_id", campaignIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (campaignResult.error) throw campaignResult.error;
    if (organizationResult.error) throw organizationResult.error;
    if (directAssetResult.error) throw directAssetResult.error;
    if (usageResult.error) throw usageResult.error;

    const usageAssetIds = [
      ...new Set((usageResult.data || []).map((row) => row.asset_id).filter(Boolean)),
    ];

    const usageAssetResult = usageAssetIds.length
      ? await supabaseAdmin
          .from("creative_assets")
          .select(
            "id,campaign_id,organization_id,asset_type,source_type,name,file_name,file_url,image_url,thumbnail_url,uri,mime_type,status,approval_state,metadata,archived,created_at",
          )
          .in("id", usageAssetIds)
      : { data: [], error: null };

    if (usageAssetResult.error) throw usageAssetResult.error;

    const campaignsById = new Map(
      (campaignResult.data || []).map((campaign) => [campaign.id, campaign]),
    );
    const organizationsById = new Map(
      (organizationResult.data || []).map((organization) => [organization.id, organization]),
    );

    const assetsById = new Map();
    for (const asset of [...(directAssetResult.data || []), ...(usageAssetResult.data || [])]) {
      if (asset.archived === true) continue;
      assetsById.set(asset.id, asset);
    }

    const assetIdsByCampaign = new Map();
    for (const asset of directAssetResult.data || []) {
      if (asset.archived === true || asset.organization_id == null) continue;
      if (!assetIdsByCampaign.has(asset.campaign_id)) {
        assetIdsByCampaign.set(asset.campaign_id, new Set());
      }
      assetIdsByCampaign.get(asset.campaign_id).add(asset.id);
    }

    for (const usage of usageResult.data || []) {
      const asset = assetsById.get(usage.asset_id);
      if (!asset || asset.organization_id !== usage.organization_id) continue;
      if (!assetIdsByCampaign.has(usage.campaign_id)) {
        assetIdsByCampaign.set(usage.campaign_id, new Set());
      }
      assetIdsByCampaign.get(usage.campaign_id).add(usage.asset_id);
    }

    const serializedAssetsByCampaign = new Map();
    const rawVisualAssetsByCampaign = new Map();

    for (const campaignId of campaignIds) {
      const campaign = campaignsById.get(campaignId);
      const assetIds = [...(assetIdsByCampaign.get(campaignId) || [])];
      const rawAssets = assetIds
        .map((assetId) => assetsById.get(assetId))
        .filter(
          (asset) =>
            asset &&
            asset.organization_id === campaign?.organization_id &&
            isCreativeVisualAsset(asset),
        );
      rawVisualAssetsByCampaign.set(campaignId, rawAssets);
      const serialized = (
        await Promise.all(rawAssets.map((asset) => serializeAsset(asset)))
      ).filter(Boolean);
      serializedAssetsByCampaign.set(campaignId, serialized);
    }

    const membersByGroup = new Map();
    for (const member of visibleMembers) {
      const campaign = campaignsById.get(member.marketing_campaign_id);
      if (!campaign) continue;

      if (!membersByGroup.has(member.campaign_group_id)) {
        membersByGroup.set(member.campaign_group_id, []);
      }

      const assets = serializedAssetsByCampaign.get(campaign.id) || [];
      const visibleAssetIds = new Set(assets.map((asset) => asset.id));
      const rawVisualAssets = rawVisualAssetsByCampaign.get(campaign.id) || [];

      membersByGroup.get(member.campaign_group_id).push({
        ...member,
        organization: organizationsById.get(member.organization_id) || null,
        campaign: {
          ...campaign,
          assets,
          asset_count: assets.length,
          approved_asset_count: rawVisualAssets.filter(
            (asset) =>
              visibleAssetIds.has(asset.id) &&
              ["approved", "ready"].includes(approvalValue(asset)),
          ).length,
        },
      });
    }

    return {
      groups: fullyAccessibleGroups.map((group) => ({
        ...group,
        members: membersByGroup.get(group.id) || [],
        total_member_count: (membersByGroup.get(group.id) || []).length,
        accessible_member_count: (membersByGroup.get(group.id) || []).length,
      })),
    };
  },
);
