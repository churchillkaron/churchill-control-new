import {
  GoogleAdsRuntime,
} from "@/lib/marketing/services/GoogleAdsRuntime";
import {
  translateGoogleAdsCampaignPlan,
} from "@/lib/marketing/campaigns/adapters/GoogleAdsCampaignPlanTranslator";

function executionError({
  stage,
  code,
  message,
  correction = null,
  details = null,
  cause = null,
}) {
  const error = new Error(message);
  error.name = "CampaignExecutionError";
  error.stage = stage;
  error.code = code;
  error.provider = "google_ads";
  error.correction = correction;
  error.details = details;
  error.status = 400;
  if (cause) error.cause = cause;
  return error;
}

export const GoogleAdsCampaignAdapter = {
  id: "google_ads",
  version: "GOOGLE_ADS_MANAGED_SEARCH_V1",
  status: "ACTIVE",

  async preflight({ plan, channel }) {
    const translated = translateGoogleAdsCampaignPlan({ plan, channel });

    return {
      adapter: this.version,
      channel_id: "google_ads",
      provider: "google_ads",
      ready: true,
      execution_mode: "PAUSED_FIRST",
      wallet_changed: false,
      campaign_created: false,
      delivery_networks: ["google_search"],
      authorized_budget: translated.authorizedBudget,
      daily_budget: translated.dailyBudget,
      account_asset_id: translated.accountAssetId,
      provider_payload_summary: {
        campaign_name: translated.campaignName,
        start_at: translated.startAt,
        end_at: translated.endAt,
        destination_url: translated.destinationUrl,
        headline_count: translated.headlines.length,
        description_count: translated.descriptions.length,
        keyword_count: translated.keywords.length,
      },
    };
  },

  async execute({ organizationId, plan, channel }) {
    const translated = translateGoogleAdsCampaignPlan({ plan, channel });

    try {
      const result = await GoogleAdsRuntime.createSearchCampaign({
        organizationId,
        ...translated,
      });

      return {
        adapter: this.version,
        channel_id: "google_ads",
        provider: "google_ads",
        status: "PAUSED",
        delivery_networks: ["google_search"],
        result,
      };
    } catch (error) {
      if (error?.name === "CampaignExecutionError") throw error;
      throw executionError({
        stage: "PROVIDER_CREATE_PAUSED",
        code: "GOOGLE_ADS_PAUSED_CREATION_FAILED",
        message: error?.message || "Google Ads paused campaign creation failed",
        correction:
          "Correct the exact Google Ads account, budget, copy, keyword or provider validation error, then retry. Media budget remains governed by the wallet.",
        cause: error,
      });
    }
  },
};

export default GoogleAdsCampaignAdapter;
