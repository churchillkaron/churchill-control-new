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
  executeProvider,
} from "@/lib/platform/service-runtime/providers/ProviderExecutor";

import {
  createManagedMediaCampaign,
  getManagedMediaCampaign,
  settleManagedMediaCampaign,
  updateManagedMediaCampaign,
} from "@/lib/marketing/repositories/ManagedMediaCampaignRepository";

function positive(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
  return amount;
}

function nonNegative(value, label) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} must be zero or greater`);
  }
  return amount;
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(6));
}

function currency(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) throw new Error("Campaign currency is required");
  return normalized;
}

function text(value) {
  return String(value || "").trim();
}

function mediaMarkupPercent(service = {}) {
  return nonNegative(
    service?.configuration?.media_markup_percent ??
      service?.metadata?.media_markup_percent ??
      0,
    "Managed media markup percent"
  );
}

async function activeService(organizationId, serviceId, label = null) {
  const resolvedServiceId = text(serviceId);
  if (!resolvedServiceId) throw new Error("service_id required");

  const service = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: resolvedServiceId,
  });

  const serviceLabel = label || resolvedServiceId;
  if (!service || String(service.status || "").toUpperCase() !== "ACTIVE") {
    throw new Error(`${serviceLabel} is not active for this organization`);
  }

  if (service.usage_enabled === false || service.billing_enabled === false) {
    throw new Error(`${serviceLabel} usage and billing must be enabled`);
  }

  return service;
}

async function reserveBudget({
  organizationId,
  entityId = null,
  serviceId,
  provider,
  capability,
  operation = "managed.media.reserve",
  campaignName,
  authorizedBudget,
  campaignCurrency,
  sourceAssetId = null,
  destination = null,
  deliveryChannels = [],
  targeting = {},
  schedule = {},
  metadata = {},
}) {
  if (!organizationId) throw new Error("organization_id required");
  if (!campaignName) throw new Error("Campaign name is required");
  if (!provider) throw new Error("provider required");
  if (!capability) throw new Error("capability required");

  const providerBudget = positive(authorizedBudget, "Authorized campaign budget");
  const resolvedCurrency = currency(campaignCurrency);
  const service = await activeService(organizationId, serviceId);
  const markupPercent = mediaMarkupPercent(service);
  const platformFeeBudget = roundMoney(providerBudget * markupPercent / 100);
  const customerReservedAmount = roundMoney(providerBudget + platformFeeBudget);

  const usage = await UsageRuntime.start({
    organization_id: organizationId,
    bill_to_organization_id: organizationId,
    entity_id: entityId,
    organization_service_id: service.id,
    category: "MANAGED_MEDIA",
    provider,
    capability,
    operation,
    currency: resolvedCurrency,
    quantity: providerBudget,
    unit: "currency_unit",
    metadata: {
      ...metadata,
      service_id: serviceId,
      campaign_name: campaignName,
      settlement_model: "PREPAID_WALLET_PROVIDER_SPEND_PLUS_PLATFORM_FEE",
      provider_billed_to: "AVANTIQO",
      customer_payment_source: "AVANTIQO_PREPAID_WALLET",
      media_markup_percent: markupPercent,
      authorized_provider_budget: providerBudget,
      authorized_platform_fee: platformFeeBudget,
      authorized_customer_charge: customerReservedAmount,
    },
  });

  const reservationReference = `${usage.id}:managed-media-budget`;
  let reserved = false;

  try {
    await WalletRuntime.reserve({
      organization_id: organizationId,
      amount: customerReservedAmount,
      provider,
      reference: reservationReference,
      currency: resolvedCurrency,
      metadata: {
        usage_id: usage.id,
        service_id: serviceId,
        campaign_name: campaignName,
        reservation_type: "MANAGED_MEDIA_BUDGET_AND_PLATFORM_FEE",
        provider_billed_to: "AVANTIQO",
        media_markup_percent: markupPercent,
        authorized_provider_budget: providerBudget,
        authorized_platform_fee: platformFeeBudget,
        authorized_customer_charge: customerReservedAmount,
      },
    });
    reserved = true;

    const ledger = await createManagedMediaCampaign({
      organization_id: organizationId,
      organization_service_id: service.id,
      usage_id: usage.id,
      provider,
      service_id: serviceId,
      status: "RESERVED",
      campaign_name: campaignName,
      currency: resolvedCurrency,
      authorized_budget: providerBudget,
      reserved_amount: customerReservedAmount,
      provider_spend_amount: 0,
      platform_fee_amount: 0,
      source_asset_id: sourceAssetId,
      destination,
      delivery_channels: deliveryChannels,
      targeting,
      schedule,
      metadata: {
        ...metadata,
        reservation_reference: reservationReference,
        settlement_model: "PREPAID_WALLET_PROVIDER_SPEND_PLUS_PLATFORM_FEE",
        provider_billed_to: "AVANTIQO",
        customer_payment_source: "AVANTIQO_PREPAID_WALLET",
        media_markup_percent: markupPercent,
        authorized_provider_budget: providerBudget,
        authorized_platform_fee: platformFeeBudget,
        authorized_customer_charge: customerReservedAmount,
      },
    });

    return {
      service,
      usage,
      ledger,
      amount: customerReservedAmount,
      providerBudget,
      platformFeeBudget,
      customerReservedAmount,
      mediaMarkupPercent: markupPercent,
      currency: resolvedCurrency,
      reservationReference,
    };
  } catch (error) {
    if (reserved) {
      await WalletRuntime.release({
        organization_id: organizationId,
        amount: customerReservedAmount,
        provider,
        reference: `${usage.id}:managed-media-reservation-failure-release`,
        currency: resolvedCurrency,
        metadata: {
          usage_id: usage.id,
          service_id: serviceId,
          reason: "MEDIA_LEDGER_CREATION_FAILED",
        },
      }).catch(() => null);
    }

    await UsageRuntime.fail({
      usage_id: usage.id,
      error,
      metadata: { service_id: serviceId },
    }).catch(() => null);

    throw error;
  }
}

async function failReservation({
  organizationId,
  campaignId,
  error,
  reason = "PROVIDER_CREATION_FAILED",
}) {
  const campaign = await getManagedMediaCampaign({
    organization_id: organizationId,
    id: campaignId,
  });
  if (!campaign) throw new Error("Managed media campaign not found");

  const reserved = Number(campaign.reserved_amount || 0);
  const settled = Number(campaign.settled_amount || 0);
  const released = Number(campaign.released_amount || 0);
  const releasable = Math.max(0, reserved - settled - released);

  if (releasable > 0) {
    await WalletRuntime.release({
      organization_id: organizationId,
      amount: releasable,
      provider: campaign.provider,
      reference: `${campaign.usage_id}:managed-media-failure-release`,
      currency: campaign.currency,
      metadata: {
        usage_id: campaign.usage_id,
        campaign_id: campaign.id,
        reason,
      },
    });
  }

  const updated = await updateManagedMediaCampaign({
    organization_id: organizationId,
    id: campaign.id,
    updates: {
      status: "FAILED",
      released_amount: released + releasable,
      metadata: {
        ...(campaign.metadata || {}),
        failure_reason: reason,
        error: error?.message || String(error || reason),
      },
    },
  });

  await UsageRuntime.fail({
    usage_id: campaign.usage_id,
    error: error || new Error(reason),
    metadata: {
      service_id: campaign.service_id,
      campaign_id: campaign.id,
    },
  }).catch(() => null);

  return updated;
}

export const ManagedMediaSpendRuntime = {
  reserveBudget,
  failReservation,

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
    const reservation = await reserveBudget({
      organizationId,
      entityId,
      serviceId: "meta-ads",
      provider: "meta",
      capability: "marketing.ads.manage",
      operation: "marketing.ads.create",
      campaignName,
      authorizedBudget,
      campaignCurrency,
      sourceAssetId: sourceAssetId || null,
      destination: destination || null,
      deliveryChannels: deliveryChannels || [],
      targeting: targeting || {},
      schedule: schedule || {},
    });

    const {
      service,
      usage,
      ledger,
      amount,
      providerBudget,
      platformFeeBudget,
      mediaMarkupPercent: markupPercent,
      currency: resolvedCurrency,
    } = reservation;

    try {
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
      if (!output.campaign_id || !output.ad_set_id || !output.creative_id || !output.ad_id) {
        throw new Error("Meta campaign creation did not return the complete provider object chain");
      }

      const updated = await updateManagedMediaCampaign({
        organization_id: organizationId,
        id: ledger.id,
        updates: {
          status: "PAUSED",
          provider_campaign_id: output.campaign_id,
          provider_ad_set_id: output.ad_set_id,
          provider_creative_id: output.creative_id,
          provider_ad_id: output.ad_id,
          provider_result: output,
        },
      });

      return {
        success: true,
        status: "PAUSED",
        campaign: updated,
        usage_id: usage.id,
        media_budget: providerBudget,
        platform_fee_budget: platformFeeBudget,
        media_markup_percent: markupPercent,
        reserved_amount: amount,
        currency: resolvedCurrency,
        provider_result: output,
      };
    } catch (error) {
      await failReservation({
        organizationId,
        campaignId: ledger.id,
        error,
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
    if (!organizationId) throw new Error("organization_id required");
    if (!campaignId) throw new Error("campaignId is required");
    if (!settlementKey) throw new Error("settlementKey is required");

    const campaign = await getManagedMediaCampaign({
      organization_id: organizationId,
      id: campaignId,
    });

    if (!campaign) throw new Error("Managed media campaign not found");

    const settlement = await settleManagedMediaCampaign({
      organization_id: organizationId,
      campaign_id: campaignId,
      cumulative_provider_spend: cumulativeProviderSpend,
      settlement_key: settlementKey,
      complete,
    });

    const updated = settlement?.campaign || settlement;

    if (complete && settlement?.already_completed !== true) {
      const providerSpend = Number(updated.provider_spend_amount || 0);
      const platformFee = Number(updated.platform_fee_amount || 0);
      const customerCharge = Number(updated.settled_amount || 0);
      const markupPercent = nonNegative(
        updated.metadata?.media_markup_percent ?? 0,
        "Managed media markup percent"
      );

      await UsageRuntime.complete({
        usage_id: campaign.usage_id,
        supplier_cost: providerSpend,
        platform_markup: markupPercent,
        customer_price: customerCharge,
        quantity: providerSpend,
        unit: "currency_unit",
        latency_ms: null,
        metadata: {
          campaign_id: campaign.id,
          provider_campaign_id: campaign.provider_campaign_id,
          authorized_provider_budget: Number(campaign.authorized_budget || 0),
          authorized_customer_charge: Number(campaign.reserved_amount || 0),
          actual_provider_spend: providerSpend,
          platform_fee_amount: platformFee,
          customer_charge: customerCharge,
          media_markup_percent: markupPercent,
          released_amount: Number(updated.released_amount || 0),
          settlement_model: "PREPAID_WALLET_PROVIDER_SPEND_PLUS_PLATFORM_FEE",
          provider_billed_to: "AVANTIQO",
          customer_payment_source: "AVANTIQO_PREPAID_WALLET",
          prepaid_wallet_charged: true,
          customer_invoice_required: false,
        },
      });
    }

    return updated;
  },
};