import {
  executeProvider,
} from "@/lib/platform/service-runtime/providers/ProviderExecutor";
import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

import {
  listManagedMediaReconciliationCandidates,
} from "@/lib/marketing/repositories/ManagedMediaCampaignRepository";

import {
  ManagedMediaSpendRuntime,
} from "@/lib/marketing/services/ManagedMediaSpendRuntime";

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function text(value) {
  return String(value || "").trim();
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
  return `${campaign.provider}:${campaign.provider_campaign_id}:${stop}:${amount}`;
}

function dateOnly(value, fallback = null) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return fallback;
  return new Date(timestamp).toISOString().slice(0, 10);
}

async function metaSpend(campaign) {
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
  return {
    cumulative_spend: Number(spend.cumulative_spend || 0),
    currency: spend.currency || campaign.currency,
    date_stop: spend.date_stop || new Date().toISOString().slice(0, 10),
  };
}

async function googleAdsSpend(campaign) {
  const customerId = text(campaign.metadata?.customer_id).replace(/\D/g, "");
  if (!customerId) throw new Error("Google Ads campaign customer id is missing");

  const start =
    dateOnly(campaign.schedule?.start_time) ||
    dateOnly(campaign.created_at) ||
    new Date().toISOString().slice(0, 10);
  const stop = new Date().toISOString().slice(0, 10);
  const campaignId = text(campaign.provider_campaign_id).replace(/\D/g, "");
  if (!campaignId) throw new Error("Google Ads provider campaign id is missing");

  const execution = await ServiceExecutionRuntime.execute({
    organization_id: campaign.organization_id,
    entity_id: campaign.metadata?.entity_id || null,
    service_id: campaign.service_id || "google-ads",
    provider_id: "google_ads",
    capability: "marketing.google.ads.manage",
    input: {
      action: "search",
      customer_id: customerId,
      login_customer_id: campaign.metadata?.login_customer_id || undefined,
      currency: campaign.currency,
      quantity: 1,
      query:
        `SELECT campaign.id, metrics.cost_micros FROM campaign ` +
        `WHERE campaign.id = ${campaignId} ` +
        `AND segments.date BETWEEN '${start}' AND '${stop}'`,
    },
    category: "MARKETING_RECONCILIATION",
    metadata: {
      module: "MANAGED_MEDIA_RECONCILIATION",
      campaign_id: campaign.id,
    },
  });

  const output = execution?.output?.output || {};
  const rows = Array.isArray(output.results) ? output.results : [];
  const micros = rows.reduce((sum, row) => {
    const value = Number(row?.metrics?.costMicros ?? row?.metrics?.cost_micros ?? 0);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

  return {
    cumulative_spend: Number((micros / 1_000_000).toFixed(6)),
    currency: campaign.currency,
    date_stop: stop,
  };
}

async function providerSpend(campaign) {
  if (campaign.provider === "meta") return metaSpend(campaign);
  if (campaign.provider === "google_ads") return googleAdsSpend(campaign);
  throw new Error(`Managed media reconciliation is not implemented for ${campaign.provider}`);
}

async function reconcileCampaign(campaign) {
  const spend = await providerSpend(campaign);
  const cumulativeSpend = Number(spend.cumulative_spend || 0);

  if (!Number.isFinite(cumulativeSpend) || cumulativeSpend < 0) {
    throw new Error(`${campaign.provider} returned an invalid cumulative campaign spend`);
  }

  if (spend.currency && upper(spend.currency) !== upper(campaign.currency)) {
    throw new Error(
      `${campaign.provider} spend currency does not match wallet reservation: ${spend.currency}:${campaign.currency}`
    );
  }

  const authorized = Number(campaign.authorized_budget || campaign.reserved_amount || 0);
  if (authorized > 0 && cumulativeSpend > authorized) {
    throw new Error(
      `MANAGED_MEDIA_SPEND_EXCEEDS_AUTHORIZED_BUDGET:${cumulativeSpend}:${authorized}`
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
    provider: campaign.provider,
    provider_campaign_id: campaign.provider_campaign_id,
    cumulative_spend: cumulativeSpend,
    currency: campaign.currency,
    complete,
    status: updated.status,
  };
}

export const ManagedMediaReconciliationRuntime = {
  async reconcile({ limit = 50, provider = null } = {}) {
    const campaigns = await listManagedMediaReconciliationCandidates({
      limit,
      provider,
    });
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
          provider: campaign.provider,
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
