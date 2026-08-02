import {
  MetaAdsRuntime,
} from "@/lib/marketing/services/MetaAdsRuntime";

import {
  translateMetaCampaignPlan,
} from "@/lib/marketing/campaigns/adapters/MetaCampaignPlanTranslator";

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
  error.provider = "meta";
  error.correction = correction;
  error.details = details;
  error.status = 400;
  if (cause) error.cause = cause;
  return error;
}

export const MetaCampaignAdapter = {
  id: "meta",
  version: "META_MANAGED_MEDIA_V1",
  status: "ACTIVE",

  async preflight({ plan, channel }) {
    const translated = translateMetaCampaignPlan({ plan, channel });

    return {
      adapter: this.version,
      channel_id: "meta",
      provider: "meta",
      ready: true,
      execution_mode: "PAUSED_FIRST",
      wallet_changed: false,
      campaign_created: false,
      delivery_networks: translated.deliveryChannels,
      destination: translated.destination,
      authorized_budget: translated.authorizedBudget,
      currency: translated.currency,
      provider_payload_summary: {
        campaign_name: translated.campaign.name,
        objective: translated.campaign.objective,
        optimization_goal: translated.adSet.optimization_goal,
        billing_event: translated.adSet.billing_event,
        lifetime_budget_minor: translated.adSet.lifetime_budget,
        end_time: translated.adSet.end_time,
        exact_asset_id: translated.creative.asset_id,
      },
    };
  },

  async execute({ organizationId, entityId = null, plan, channel }) {
    const translated = translateMetaCampaignPlan({ plan, channel });

    try {
      const result = await MetaAdsRuntime.createCampaign({
        organizationId,
        entityId,
        ...translated,
      });

      return {
        adapter: this.version,
        channel_id: "meta",
        provider: "meta",
        status: "PAUSED",
        delivery_networks: translated.deliveryChannels,
        result,
      };
    } catch (error) {
      if (error?.name === "CampaignExecutionError") throw error;
      throw executionError({
        stage: "PROVIDER_CREATE_PAUSED",
        code: "META_PAUSED_CREATION_FAILED",
        message: error?.message || "Meta paused campaign creation failed",
        correction:
          "Review the returned Meta provider error, correct the exact field, and retry while the campaign remains unlaunched.",
        cause: error,
      });
    }
  },
};

export default MetaCampaignAdapter;
