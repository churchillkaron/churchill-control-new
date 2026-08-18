export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { canUseMultiOrganizationMarketing } from "@/lib/marketing/security/marketingCampaignAccess";
import { buildAdsPortfolioIntelligence } from "@/lib/marketing/intelligence/buildAdsPortfolioIntelligence";

function errorResponse(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error: error?.message || String(error || "Campaign intelligence failed"),
    },
    { status },
  );
}

async function loadGroup({ groupId, ownerOrganizationId, request }) {
  const ownerAccess = await requireOrganizationAccess({
    organizationId: ownerOrganizationId,
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

  const { data: group, error: groupError } = await supabaseAdmin
    .from("marketing_campaign_groups")
    .select("*")
    .eq("id", groupId)
    .eq("organization_id", ownerAccess.organizationId)
    .maybeSingle();

  if (groupError) throw groupError;
  if (!group) {
    const error = new Error("Campaign group not found");
    error.status = 404;
    throw error;
  }

  const { data: members, error: memberError } = await supabaseAdmin
    .from("marketing_campaign_group_members")
    .select("*")
    .eq("campaign_group_id", group.id)
    .eq("member_status", "active")
    .order("sequence_no", { ascending: true });

  if (memberError) throw memberError;

  const organizationIds = [
    ...new Set((members || []).map((member) => member.organization_id).filter(Boolean)),
  ];

  for (const organizationId of organizationIds) {
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      const error = new Error("Access to every participating organization is required");
      error.status = 403;
      throw error;
    }
  }

  const campaignIds = (members || [])
    .map((member) => member.marketing_campaign_id)
    .filter(Boolean);

  const [campaignResult, organizationResult, assetResult] = await Promise.all([
    campaignIds.length
      ? supabaseAdmin.from("marketing_campaigns").select("*").in("id", campaignIds)
      : Promise.resolve({ data: [], error: null }),
    organizationIds.length
      ? supabaseAdmin.from("organizations").select("id,name").in("id", organizationIds)
      : Promise.resolve({ data: [], error: null }),
    campaignIds.length
      ? supabaseAdmin
          .from("creative_assets")
          .select("id,campaign_id,organization_id,status,approval_state,archived")
          .in("campaign_id", campaignIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (campaignResult.error) throw campaignResult.error;
  if (organizationResult.error) throw organizationResult.error;
  if (assetResult.error) throw assetResult.error;

  const campaignsById = new Map(
    (campaignResult.data || []).map((campaign) => [campaign.id, campaign]),
  );
  const organizationsById = new Map(
    (organizationResult.data || []).map((organization) => [organization.id, organization]),
  );

  const assetsByCampaign = new Map();
  for (const asset of assetResult.data || []) {
    if (asset.archived === true) continue;
    if (!assetsByCampaign.has(asset.campaign_id)) assetsByCampaign.set(asset.campaign_id, []);
    assetsByCampaign.get(asset.campaign_id).push(asset);
  }

  return {
    ...group,
    members: (members || []).map((member) => {
      const campaign = campaignsById.get(member.marketing_campaign_id) || null;
      return {
        ...member,
        organization: organizationsById.get(member.organization_id) || null,
        campaign: campaign
          ? {
              ...campaign,
              assets: assetsByCampaign.get(campaign.id) || [],
            }
          : null,
      };
    }),
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const ownerOrganizationId = String(body?.organizationId || "").trim();
    const groupId = String(body?.groupId || "").trim();

    if (!ownerOrganizationId || !groupId) {
      return errorResponse(new Error("organizationId and groupId are required"), 400);
    }

    const group = await loadGroup({
      groupId,
      ownerOrganizationId,
      request,
    });

    return NextResponse.json({
      success: true,
      data: buildAdsPortfolioIntelligence(group),
    });
  } catch (error) {
    return errorResponse(error, Number(error?.status || 500));
  }
}
