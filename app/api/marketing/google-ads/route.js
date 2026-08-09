export const dynamic = "force-dynamic";

import {
  withApiHandler,
} from "@/lib/shared/http/withApiHandler";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  GoogleAdsRuntime,
} from "@/lib/marketing/services/GoogleAdsRuntime";

async function resolveOrganizationAccess({
  value,
  request,
  requiredPermission = null,
}) {
  const access = await requireOrganizationAccess({
    organizationId: value,
    request,
    requiredPermission,
  });

  if (!access.success) {
    const error = new Error(access.error || "Organization access denied");
    error.status = access.status || 403;
    throw error;
  }

  return access;
}

export const GET = withApiHandler(
  "marketing-google-ads-readiness",
  async (request) => {
    const url = new URL(request.url);
    const access = await resolveOrganizationAccess({
      value:
        url.searchParams.get("organizationId") ||
        url.searchParams.get("organization_id"),
      request,
    });

    return GoogleAdsRuntime.readiness({
      organizationId: access.organizationId,
    });
  }
);

export const POST = withApiHandler(
  "marketing-google-ads-command",
  async (request) => {
    const body = await request.json();
    const access = await resolveOrganizationAccess({
      value: body.organizationId || body.organization_id,
      request,
      requiredPermission: "marketing.ads.manage",
    });

    const action = String(body.action || "create_search_campaign")
      .trim()
      .toLowerCase();

    if (action === "create_search_campaign") {
      return GoogleAdsRuntime.createSearchCampaign({
        organizationId: access.organizationId,
        accountAssetId: body.accountAssetId || body.account_asset_id,
        campaignName: body.campaignName || body.campaign_name,
        authorizedBudget: body.authorizedBudget || body.authorized_budget,
        dailyBudget: body.dailyBudget || body.daily_budget,
        startAt: body.startAt || body.start_at,
        endAt: body.endAt || body.end_at,
        destinationUrl: body.destinationUrl || body.destination_url,
        headlines: body.headlines || [],
        descriptions: body.descriptions || [],
        keywords: body.keywords || [],
        adGroupName: body.adGroupName || body.ad_group_name || null,
        loginCustomerId: body.loginCustomerId || body.login_customer_id || null,
      });
    }

    if (action === "activate" || action === "pause") {
      return GoogleAdsRuntime.setCampaignStatus({
        organizationId: access.organizationId,
        campaignId: body.campaignId || body.campaign_id,
        status: action === "activate" ? "ACTIVE" : "PAUSED",
      });
    }

    const error = new Error(`Unsupported Google Ads action: ${action}`);
    error.status = 400;
    throw error;
  }
);
