import {
  OrganizationServiceRuntime,
} from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";

import {
  WalletRuntime,
} from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";

import {
  UsageRuntime,
} from "@/lib/platform/service-runtime/usage/UsageRuntime";

import {
  BillingRuntime,
} from "@/lib/platform/service-runtime/billing/runtime/BillingRuntime";

import {
  executeProvider,
} from "@/lib/platform/service-runtime/providers/ProviderExecutor";

import {
  createManagedMediaCampaign,
  getManagedMediaCampaign,
  updateManagedMediaCampaign,
} from "@/lib/marketing/repositories/ManagedMediaCampaignRepository";

function positive(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
  return amount;
}

function currency(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) throw new Error("Campaign currency is required");
  return normalized;
}

async function activeService(organizationId) {
  const service = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: "meta-ads",
  });

  if (!service || String(service.status || "").toUpperCase() !== "ACTIVE") {
    throw new Error("Managed Meta Advertising is not active for this organization");
  }

  if (service.usage_enabled === false || service.billing_enabled === false) {
    throw new Error("Managed Meta Advertising usage and billing must be enabled");
  }

  return service;
}

export const ManagedMediaSpendRuntime = {
  async reserveAndCreate({
    organizationId,
    entityId = null,
    campaignName,
    authorizedBudget,
    campaignCurrency,
    sourceAssetId,
    destination,
    deliveryChannels,
    targeting,
    schedule,
    providerInput,
  }) {
    if (!organizationId) throw new Error("organization_id required");
    if (!campaignName) throw new Error("Campaign name is required");

    const amount = positive(authorizedBudget, "Authorized campaign budget");
    const resolvedCurrency = currency(campaignCurrency);
    const service = await activeService(organizationId);

    const usage = await UsageRuntime.start({
      organization_id: organizationId,
      bill_to_organization_id: organizationId,
      entity_id: entityId,
      organization_service_id: service.id,
      category: "MANAGED_MEDIA",
      provider: "meta",
      capability: "marketing.ads.manage",
      operation: "marketing.ads.create",
      currency: resolvedCurrency,
      quantity: amount,
      unit: "currency_unit",
      metadata: {
        service_id: "meta-ads",
        campaign_name: campaignName,
        managed_billing: true,
        provider_billed_to: "AVANTIQO",
      },
    });

    const reservationReference = `${usage.id}:managed-media-budget`;
    let reserved = false;
    let ledger = null;

    try {
      await WalletRuntime.reserve({
        organization_id: organizationId,
        amount,
        provider: "meta",
        reference: reservationReference,
        currency: resolvedCurrency,
        metadata: {
          usage_id: usage.id,
          service_id: "meta-ads",
          campaign_name: campaignName,
          reservation_type: "MANAGED_MEDIA_BUDGET",
        },
      });
      reserved = true;

      ledger = await createManagedMediaCampaign({
        organization_id: organizationId,
        organization_service_id: service.id,
        usage_id: usage.id,
        provider: "meta",
        service_id: "meta-ads",
        status: "RESERVED",
        campaign_name: campaignName,
        currency: resolvedCurrency,
        authorized_budget: amount,
        reserved_amount: amount,
        source_asset_id: sourceAssetId || null,
        destination: destination || null,
        delivery_channels: deliveryChannels || [],
        targeting: targeting || {},
        schedule: schedule || {},
        metadata: {
          reservation_reference: reservationReference,
          provider_billed_to: "AVANTIQO",
          customer_payment_source: "AVANTIQO_PREPAID_WALLET",
        },
      });

      const result = await executeProvider({
        provider: "meta",
        capability: "marketing.ads.manage",
        model: null,
        input: {
          ...providerInput,
          action: "create_campaign_bundle",
        },
        context: {
          organization_id: organizationId,
          entity_id: entityId,
          organization_service_id: service.id,
          usage_id: usage.id,
          currency: resolvedCurrency,
        },
      });

      const output = result?.output || result || {};

      const updated = await updateManagedMediaCampaign({
        organization_id: organizationId,
        id: ledger.id,
        updates: {
          status: "PAUSED",
          provider_campaign_id: output.campaign_id || null,
          provider_ad_set_id: output.ad_set_id || null,
          provider_creative_id: output.creative_id || null,
          provider_ad_id: output.ad_id || null,
          provider_result: output,
        },
      });

      return {
        success: true,
        status: "PAUSED",
        campaign: updated,
        usage_id: usage.id,
        reserved_amount: amount,
        currency: resolvedCurrency,
        provider_result: output,
      };
    } catch (error) {
      if (reserved) {
        await WalletRuntime.release({
          organization_id: organizationId,
          amount,
          provider: "meta",
          reference: `${usage.id}:managed-media-failure-release`,
          currency: resolvedCurrency,
          metadata: {
            usage_id: usage.id,
            campaign_id: ledger?.id || null,
            reason: "PROVIDER_CREATION_FAILED",
          },
        }).catch(() => null);
      }

      if (ledger) {
        await updateManagedMediaCampaign({
          organization_id: organizationId,
          id: ledger.id,
          updates: {
            status: "FAILED",
            released_amount: reserved ? amount : 0,
            metadata: {
              ...(ledger.metadata || {}),
              error: error?.message || String(error),
            },
          },
        }).catch(() => null);
      }

      await UsageRuntime.fail({
        usage_id: usage.id,
        error,
        metadata: {
          service_id: "meta-ads",
          campaign_id: ledger?.id || null,
        },
      }).catch(() => null);

      throw error;
    }
  },

  async settleSpend({
    organizationId,
    campaignId,
    cumulativeProviderSpend,
    settlementKey,
    complete = false,
  }) {
    if (!settlementKey) throw new Error("settlementKey is required");

    const campaign = await getManagedMediaCampaign({
      organization_id: organizationId,
      id: campaignId,
    });

    if (!campaign) throw new Error("Managed media campaign not found");

    const cumulative = Number(cumulativeProviderSpend);
    const settled = Number(campaign.settled_amount || 0);
    const reserved = Number(campaign.reserved_amount || 0);

    if (!Number.isFinite(cumulative) || cumulative < settled) {
      throw new Error("Cumulative provider spend cannot decrease");
    }
    if (cumulative > reserved) {
      throw new Error("Provider spend exceeds the authorized wallet reservation");
    }

    const delta = Number((cumulative - settled).toFixed(6));

    if (delta > 0) {
      await WalletRuntime.charge({
        organization_id: organizationId,
        amount: delta,
        provider: "meta",
        usage_id: campaign.usage_id,
        reference: `${campaign.id}:spend:${settlementKey}`,
        currency: campaign.currency,
        metadata: {
          campaign_id: campaign.id,
          provider_campaign_id: campaign.provider_campaign_id,
          settlement_key: settlementKey,
          cumulative_provider_spend: cumulative,
        },
      });
    }

    let releasedAmount = Number(campaign.released_amount || 0);
    let status = campaign.status;

    if (complete) {
      const unused = Number((reserved - cumulative - releasedAmount).toFixed(6));
      if (unused > 0) {
        await WalletRuntime.release({
          organization_id: organizationId,
          amount: unused,
          provider: "meta",
          reference: `${campaign.id}:completion-release`,
          currency: campaign.currency,
          metadata: {
            campaign_id: campaign.id,
            provider_campaign_id: campaign.provider_campaign_id,
          },
        });
        releasedAmount += unused;
      }
      status = "COMPLETED";
    }

    const updated = await updateManagedMediaCampaign({
      organization_id: organizationId,
      id: campaign.id,
      updates: {
        status,
        settled_amount: cumulative,
        released_amount: releasedAmount,
        completed_at: complete ? new Date().toISOString() : null,
      },
    });

    if (complete) {
      const completedUsage = await UsageRuntime.complete({
        usage_id: campaign.usage_id,
        supplier_cost: cumulative,
        platform_markup: 0,
        customer_price: cumulative,
        quantity: cumulative,
        unit: "currency_unit",
        latency_ms: null,
        metadata: {
          campaign_id: campaign.id,
          provider_campaign_id: campaign.provider_campaign_id,
          authorized_budget: reserved,
          actual_provider_spend: cumulative,
          released_amount: releasedAmount,
          managed_billing: true,
        },
      });

      await BillingRuntime.billUsage({
        usage_id: completedUsage.id,
      });
    }

    return updated;
  },
};
