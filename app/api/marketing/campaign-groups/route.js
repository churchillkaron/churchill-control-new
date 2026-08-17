export const dynamic = "force-dynamic";

import { withApiHandler } from "@/lib/shared/http/withApiHandler";
import { requireFields } from "@/lib/shared/validation/required";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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

    const organizationIds = [...new Set((members || []).map((member) => member.organization_id).filter(Boolean))];
    const accessibleOrganizations = new Set();

    for (const organizationId of organizationIds) {
      const access = await requireOrganizationAccess({
        organizationId,
        request,
      });
      if (access.success) accessibleOrganizations.add(organizationId);
    }

    const visibleMembers = (members || []).filter((member) =>
      accessibleOrganizations.has(member.organization_id),
    );
    const campaignIds = visibleMembers.map((member) => member.marketing_campaign_id).filter(Boolean);

    const [campaignResult, organizationResult, assetResult] = await Promise.all([
      campaignIds.length
        ? supabaseAdmin.from("marketing_campaigns").select("*").in("id", campaignIds)
        : Promise.resolve({ data: [], error: null }),
      organizationIds.length
        ? supabaseAdmin.from("organizations").select("id,name,organization_type,status").in("id", organizationIds)
        : Promise.resolve({ data: [], error: null }),
      campaignIds.length
        ? supabaseAdmin.from("creative_assets").select("id,campaign_id,organization_id,status,approval_state").in("campaign_id", campaignIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (campaignResult.error) throw campaignResult.error;
    if (organizationResult.error) throw organizationResult.error;
    if (assetResult.error) throw assetResult.error;

    const campaignsById = new Map((campaignResult.data || []).map((campaign) => [campaign.id, campaign]));
    const organizationsById = new Map((organizationResult.data || []).map((organization) => [organization.id, organization]));
    const assetsByCampaign = new Map();

    for (const asset of assetResult.data || []) {
      if (!assetsByCampaign.has(asset.campaign_id)) assetsByCampaign.set(asset.campaign_id, []);
      assetsByCampaign.get(asset.campaign_id).push(asset);
    }

    const membersByGroup = new Map();
    for (const member of visibleMembers) {
      const campaign = campaignsById.get(member.marketing_campaign_id);
      if (!campaign) continue;
      if (!membersByGroup.has(member.campaign_group_id)) membersByGroup.set(member.campaign_group_id, []);
      membersByGroup.get(member.campaign_group_id).push({
        ...member,
        organization: organizationsById.get(member.organization_id) || null,
        campaign: {
          ...campaign,
          asset_count: (assetsByCampaign.get(campaign.id) || []).length,
          approved_asset_count: (assetsByCampaign.get(campaign.id) || []).filter((asset) =>
            ["approved", "ready"].includes(String(asset.approval_state || asset.status || "").toLowerCase()),
          ).length,
        },
      });
    }

    return {
      groups: groups
        .map((group) => ({
          ...group,
          members: membersByGroup.get(group.id) || [],
          total_member_count: (members || []).filter((member) => member.campaign_group_id === group.id).length,
          accessible_member_count: (membersByGroup.get(group.id) || []).length,
        }))
        .filter((group) => group.accessible_member_count > 0),
    };
  },
);
