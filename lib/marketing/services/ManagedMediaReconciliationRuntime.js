import {
  executeProvider,
} from "@/lib/platform/service-runtime/providers/ProviderExecutor";

import {
  listManagedMediaReconciliationCandidates,
} from "@/lib/marketing/repositories/ManagedMediaCampaignRepository";

import {
  ManagedMediaSpendRuntime,
} from "@/lib/marketing/services/ManagedMediaSpendRuntime";

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function campaignEndTime(campaign = {}) {
  const value = campaign.schedule?.end_time || null;
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

function campaignShouldComplete(campaign, now = Date.now()) {
  const endTime = campaignEndTime(campaign);
  return endTime !== null && endTime <= now;
}

function settlementKey(campaign, spendResult) {
  const stop = spendResult.date_stop || new Date().toISOString().slice(0, 10);
  const amount = Number(spendResult.cumulative_spend || 0).toFixed(6);
  return `${campaign.provider_campaign_id}:${stop}:${amount}`;
}

async function reconcileCampaign(campaign) {
  const providerResult = await executeProvider({
    provider: "meta",
    capability: "marketing.ads.manage",
    model: null,
    input: {
      action: "get_campaign_spend",
      campaign_id: campaign.provider_campaign_id,
    },
    context: {
      organization_id: campaign.organization_id,
      organization_service_id: campaign.organization_service_id,
      usage_id: campaign.usage_id,
      currency: campaign.currency,
    },
  });

  const spend = providerResult?.output || providerResult || {};
  const cumulativeSpend = Number(spend.cumulative_spend || 0);

  if (!Number.isFinite(cumulativeSpend) || cumulativeSpend < 0) {
    throw new Error("Meta returned an invalid cumulative campaign spend");
  }

  if (spend.currency && upper(spend.currency) !== upper(campaign.currency)) {
    throw new Error(
      `Meta spend currency does not match wallet reservation: ${spend.currency}:${campaign.currency}`
    );
  }

  const complete = campaignShouldComplete(campaign);
  const updated = await ManagedMediaSpendRuntime.settleSpend({
    organizationId: campaign.organization_id,
    campaignId: campaign.id,
    cumulativeProviderSpend: cumulativeSpend,
    settlementKey: settlementKey(campaign, spend),
    complete,
  });

  return {
    campaign_id: campaign.id,
    provider_campaign_id: campaign.provider_campaign_id,
    cumulative_spend: cumulativeSpend,
    currency: campaign.currency,
    complete,
    status: updated.status,
  };
}

export const ManagedMediaReconciliationRuntime = {
  async reconcile({ limit = 50 } = {}) {
    const campaigns = await listManagedMediaReconciliationCandidates({ limit });
    const results = [];

    for (const campaign of campaigns) {
      try {
        results.push({
          success: true,
          ...(await reconcileCampaign(campaign)),
        });
      } catch (error) {
        results.push({
          success: false,
          campaign_id: campaign.id,
          provider_campaign_id: campaign.provider_campaign_id,
          error: error?.message || String(error),
        });
      }
    }

    return {
      success: results.every((item) => item.success),
      checked: campaigns.length,
      succeeded: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).length,
      results,
    };
  },
};
