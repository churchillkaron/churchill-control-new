import {
  ChannelAssetRuntime,
} from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import {
  ChannelConnectionRuntime,
} from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  OrganizationServiceRuntime,
} from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import {
  WalletRepository,
} from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";
import {
  ManagedMediaSpendRuntime,
} from "@/lib/marketing/services/ManagedMediaSpendRuntime";
import {
  getManagedMediaCampaign,
  listManagedMediaCampaigns,
  updateManagedMediaCampaign,
} from "@/lib/marketing/repositories/ManagedMediaCampaignRepository";

const PROVIDER = "google_ads";
const SERVICE_ID = "google-ads";
const CAPABILITY = "marketing.google.ads.manage";
const ASSET_TYPE = "google_ads_customer";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function positive(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
  return amount;
}

function publicUrl(value) {
  const url = new URL(text(value));
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Google Ads destination URL must use HTTP or HTTPS");
  }
  return url.toString();
}

function googleDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid campaign date");
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function micros(value) {
  return Math.round(positive(value, "Budget") * 1_000_000).toString();
}

function resourceName(result) {
  return (
    result?.results?.[0]?.resourceName ||
    result?.results?.[0]?.resource_name ||
    null
  );
}

function resourceId(name) {
  return text(name).split("/").filter(Boolean).pop() || null;
}

function normalizedHeadlines(values = []) {
  const headlines = (Array.isArray(values) ? values : [])
    .map((value) => text(value))
    .filter(Boolean);

  if (headlines.length < 3) {
    throw new Error("Responsive Search Ads require at least three headlines");
  }
  if (headlines.length > 15) {
    throw new Error("Responsive Search Ads support at most fifteen headlines");
  }
  if (headlines.some((headline) => headline.length > 30)) {
    throw new Error("Google Ads headlines cannot exceed 30 characters");
  }

  return headlines.map((headline) => ({ text: headline }));
}

function normalizedDescriptions(values = []) {
  const descriptions = (Array.isArray(values) ? values : [])
    .map((value) => text(value))
    .filter(Boolean);

  if (descriptions.length < 2) {
    throw new Error("Responsive Search Ads require at least two descriptions");
  }
  if (descriptions.length > 4) {
    throw new Error("Responsive Search Ads support at most four descriptions");
  }
  if (descriptions.some((description) => description.length > 90)) {
    throw new Error("Google Ads descriptions cannot exceed 90 characters");
  }

  return descriptions.map((description) => ({ text: description }));
}

function keywordOperations({ adGroupResource, keywords = [] }) {
  return (Array.isArray(keywords) ? keywords : [])
    .map((item) => {
      const keywordText = text(typeof item === "string" ? item : item?.text);
      if (!keywordText) return null;
      return {
        create: {
          adGroup: adGroupResource,
          status: "ENABLED",
          keyword: {
            text: keywordText,
            matchType: upper(item?.match_type || item?.matchType || "PHRASE"),
          },
        },
      };
    })
    .filter(Boolean);
}

async function context(organizationId) {
  const [connection, service, wallet, campaigns] = await Promise.all([
    ChannelConnectionRuntime.get({
      organization_id: organizationId,
      provider: PROVIDER,
    }).catch(() => null),
    OrganizationServiceRuntime.get({
      organization_id: organizationId,
      service_id: SERVICE_ID,
    }).catch(() => null),
    WalletRepository.getByOrganization(organizationId).catch(() => null),
    listManagedMediaCampaigns(organizationId).catch(() => []),
  ]);

  const assets = connection
    ? await ChannelAssetRuntime.list({
        organization_id: organizationId,
        connection_id: connection.id,
      }).catch(() => [])
    : [];

  return {
    connection,
    service,
    wallet,
    accounts: assets.filter((asset) => asset.asset_type === ASSET_TYPE),
    campaigns: campaigns.filter((campaign) => campaign.provider === PROVIDER),
  };
}

async function execute({
  organizationId,
  entityId = null,
  currency,
  input,
  operation,
}) {
  return ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    entity_id: entityId,
    service_id: SERVICE_ID,
    provider_id: PROVIDER,
    capability: CAPABILITY,
    input: {
      ...input,
      currency,
      quantity: 1,
    },
    category: "MARKETING",
    metadata: {
      module: "MARKETING_GOOGLE_ADS",
      operation,
    },
  });
}

function output(execution) {
  return execution?.output?.output || {};
}

async function mutate({
  organizationId,
  entityId,
  currency,
  customerId,
  loginCustomerId = null,
  resource,
  operations,
  operation,
}) {
  const execution = await execute({
    organizationId,
    entityId,
    currency,
    operation,
    input: {
      action: "mutate",
      customer_id: customerId,
      login_customer_id: loginCustomerId || undefined,
      resource,
      operations,
    },
  });
  return output(execution);
}

async function accountForCampaign({ organizationId, accountAssetId }) {
  const runtime = await context(organizationId);
  const account = runtime.accounts.find((item) => item.id === accountAssetId) || null;
  if (!account) throw new Error("Google Ads account is not available for this organization");
  if (!account.entity_id) {
    throw new Error("Map the Google Ads account to an Avantiqo entity before campaign execution");
  }
  return { ...runtime, account };
}

export const GoogleAdsRuntime = {
  async readiness({ organizationId }) {
    if (!organizationId) throw new Error("organization_id required");
    const runtime = await context(organizationId);
    const blockers = [];

    if (upper(runtime.connection?.status) !== "ACTIVE") {
      blockers.push("Google Ads OAuth is not connected");
    }
    if (upper(runtime.service?.status) !== "ACTIVE") {
      blockers.push("Google Ads service is not active");
    }
    if (upper(runtime.wallet?.status) !== "ACTIVE" || !runtime.wallet?.currency) {
      blockers.push("Organization prepaid wallet is not active");
    }
    if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      blockers.push("Avantiqo Google Ads developer token is not configured");
    }
    if (!runtime.accounts.length) {
      blockers.push("No Google Ads customer account has been discovered");
    }
    if (runtime.accounts.some((account) => !account.entity_id)) {
      blockers.push("Google Ads customer accounts require entity mapping");
    }

    return {
      ready: blockers.length === 0,
      blockers,
      provider: PROVIDER,
      service_status: runtime.service?.status || "NOT_ENABLED",
      connection_status: runtime.connection?.status || "NOT_CONNECTED",
      wallet: runtime.wallet
        ? {
            status: runtime.wallet.status,
            currency: runtime.wallet.currency,
            available_balance: Number(runtime.wallet.available_balance || 0),
            reserved_balance: Number(runtime.wallet.reserved_balance || 0),
          }
        : null,
      accounts: runtime.accounts,
      campaigns: runtime.campaigns,
    };
  },

  async createSearchCampaign({
    organizationId,
    accountAssetId,
    campaignName,
    authorizedBudget,
    dailyBudget,
    startAt,
    endAt,
    destinationUrl,
    headlines,
    descriptions,
    keywords = [],
    adGroupName = null,
    loginCustomerId = null,
  }) {
    if (!organizationId) throw new Error("organization_id required");
    const runtime = await accountForCampaign({ organizationId, accountAssetId });
    const { account, service, wallet, connection } = runtime;

    if (upper(connection?.status) !== "ACTIVE") {
      throw new Error("Google Ads connection is not active");
    }
    if (upper(service?.status) !== "ACTIVE") {
      throw new Error("Google Ads service is not active");
    }
    if (upper(wallet?.status) !== "ACTIVE" || !wallet?.currency) {
      throw new Error("Organization prepaid wallet is not active");
    }
    if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      throw new Error("Avantiqo Google Ads developer token is not configured");
    }

    const campaignCurrency = upper(account.metadata?.currency_code || wallet.currency);
    if (upper(wallet.currency) !== campaignCurrency) {
      throw new Error(
        `Google Ads account currency must match the wallet currency: ${campaignCurrency}:${upper(wallet.currency)}`
      );
    }

    const totalBudget = positive(authorizedBudget, "Authorized campaign budget");
    const perDay = positive(dailyBudget, "Daily campaign budget");
    if (perDay > totalBudget) {
      throw new Error("Daily Google Ads budget cannot exceed the authorized wallet budget");
    }

    const startTime = new Date(startAt);
    const endTime = new Date(endAt);
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new Error("Campaign start and end dates are required");
    }
    if (endTime <= startTime) throw new Error("Campaign end date must be after its start date");

    const url = publicUrl(destinationUrl);
    const rsaHeadlines = normalizedHeadlines(headlines);
    const rsaDescriptions = normalizedDescriptions(descriptions);
    const customerId = text(account.metadata?.customer_id || account.external_id).replace(/\D/g, "");
    if (!customerId) throw new Error("Google Ads customer id is missing");

    const reservation = await ManagedMediaSpendRuntime.reserveBudget({
      organizationId,
      entityId: account.entity_id,
      serviceId: SERVICE_ID,
      provider: PROVIDER,
      capability: CAPABILITY,
      operation: "marketing.google.ads.media.reserve",
      campaignName,
      authorizedBudget: totalBudget,
      campaignCurrency,
      destination: url,
      deliveryChannels: ["google_search"],
      targeting: { keywords },
      schedule: {
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
      },
      metadata: {
        account_asset_id: account.id,
        customer_id: customerId,
        login_customer_id: loginCustomerId || null,
        daily_budget: perDay,
        creation_mode: "PAUSED_UNTIL_APPROVED",
      },
    });

    const providerResources = {};

    try {
      const budgetResult = await mutate({
        organizationId,
        entityId: account.entity_id,
        currency: campaignCurrency,
        customerId,
        loginCustomerId,
        resource: "campaignBudgets",
        operation: "CREATE_CAMPAIGN_BUDGET",
        operations: [
          {
            create: {
              name: `${campaignName} budget ${Date.now()}`,
              amountMicros: micros(perDay),
              deliveryMethod: "STANDARD",
              explicitlyShared: false,
            },
          },
        ],
      });
      providerResources.budget = resourceName(budgetResult);
      if (!providerResources.budget) throw new Error("Google Ads did not return a campaign budget resource");

      const campaignResult = await mutate({
        organizationId,
        entityId: account.entity_id,
        currency: campaignCurrency,
        customerId,
        loginCustomerId,
        resource: "campaigns",
        operation: "CREATE_SEARCH_CAMPAIGN",
        operations: [
          {
            create: {
              name: campaignName,
              status: "PAUSED",
              advertisingChannelType: "SEARCH",
              campaignBudget: providerResources.budget,
              startDate: googleDate(startTime),
              endDate: googleDate(endTime),
              networkSettings: {
                targetGoogleSearch: true,
                targetSearchNetwork: true,
                targetContentNetwork: false,
                targetPartnerSearchNetwork: false,
              },
            },
          },
        ],
      });
      providerResources.campaign = resourceName(campaignResult);
      if (!providerResources.campaign) throw new Error("Google Ads did not return a campaign resource");

      const adGroupResult = await mutate({
        organizationId,
        entityId: account.entity_id,
        currency: campaignCurrency,
        customerId,
        loginCustomerId,
        resource: "adGroups",
        operation: "CREATE_AD_GROUP",
        operations: [
          {
            create: {
              name: text(adGroupName) || `${campaignName} ad group`,
              campaign: providerResources.campaign,
              status: "PAUSED",
              type: "SEARCH_STANDARD",
            },
          },
        ],
      });
      providerResources.adGroup = resourceName(adGroupResult);
      if (!providerResources.adGroup) throw new Error("Google Ads did not return an ad group resource");

      const criteria = keywordOperations({
        adGroupResource: providerResources.adGroup,
        keywords,
      });
      if (criteria.length) {
        await mutate({
          organizationId,
          entityId: account.entity_id,
          currency: campaignCurrency,
          customerId,
          loginCustomerId,
          resource: "adGroupCriteria",
          operation: "CREATE_KEYWORDS",
          operations: criteria,
        });
      }

      const adResult = await mutate({
        organizationId,
        entityId: account.entity_id,
        currency: campaignCurrency,
        customerId,
        loginCustomerId,
        resource: "adGroupAds",
        operation: "CREATE_RESPONSIVE_SEARCH_AD",
        operations: [
          {
            create: {
              adGroup: providerResources.adGroup,
              status: "PAUSED",
              ad: {
                finalUrls: [url],
                responsiveSearchAd: {
                  headlines: rsaHeadlines,
                  descriptions: rsaDescriptions,
                },
              },
            },
          },
        ],
      });
      providerResources.ad = resourceName(adResult);
      if (!providerResources.ad) throw new Error("Google Ads did not return an ad resource");

      const updated = await updateManagedMediaCampaign({
        organization_id: organizationId,
        id: reservation.ledger.id,
        updates: {
          status: "PAUSED",
          provider_campaign_id: resourceId(providerResources.campaign),
          provider_ad_set_id: resourceId(providerResources.adGroup),
          provider_ad_id: resourceId(providerResources.ad),
          provider_result: providerResources,
          metadata: {
            ...(reservation.ledger.metadata || {}),
            customer_id: customerId,
            account_asset_id: account.id,
            login_customer_id: loginCustomerId || null,
            campaign_resource_name: providerResources.campaign,
            budget_resource_name: providerResources.budget,
            ad_group_resource_name: providerResources.adGroup,
            ad_resource_name: providerResources.ad,
            activation_required: true,
          },
        },
      });

      return {
        success: true,
        status: "PAUSED",
        campaign: updated,
        reserved_amount: totalBudget,
        currency: campaignCurrency,
        activation_required: true,
      };
    } catch (error) {
      await ManagedMediaSpendRuntime.failReservation({
        organizationId,
        campaignId: reservation.ledger.id,
        error,
        reason: "GOOGLE_ADS_CREATION_FAILED",
      }).catch(() => null);
      throw error;
    }
  },

  async setCampaignStatus({ organizationId, campaignId, status }) {
    if (!organizationId) throw new Error("organization_id required");
    const campaign = await getManagedMediaCampaign({
      organization_id: organizationId,
      id: campaignId,
    });
    if (!campaign || campaign.provider !== PROVIDER) {
      throw new Error("Google Ads managed media campaign not found");
    }

    const nextStatus = upper(status);
    if (!["ACTIVE", "PAUSED"].includes(nextStatus)) {
      throw new Error("Google Ads campaign status must be ACTIVE or PAUSED");
    }

    const customerId = text(campaign.metadata?.customer_id).replace(/\D/g, "");
    const campaignResource = text(campaign.metadata?.campaign_resource_name);
    if (!customerId || !campaignResource) {
      throw new Error("Google Ads campaign provider references are incomplete");
    }

    const accountContext = await context(organizationId);
    const account = accountContext.accounts.find(
      (item) => item.id === campaign.metadata?.account_asset_id
    );
    if (!account?.entity_id) throw new Error("Google Ads campaign account mapping is missing");
    if (upper(accountContext.wallet?.status) !== "ACTIVE") {
      throw new Error("Organization prepaid wallet is not active");
    }
    if (nextStatus === "ACTIVE") {
      const reserved = Number(campaign.reserved_amount || 0);
      const settled = Number(campaign.settled_amount || 0);
      const released = Number(campaign.released_amount || 0);
      if (reserved - settled - released <= 0) {
        throw new Error("No reserved Google Ads media budget remains");
      }
    }

    const providerStatus = nextStatus === "ACTIVE" ? "ENABLED" : "PAUSED";
    await mutate({
      organizationId,
      entityId: account.entity_id,
      currency: campaign.currency,
      customerId,
      loginCustomerId: campaign.metadata?.login_customer_id || null,
      resource: "campaigns",
      operation: `${nextStatus}_SEARCH_CAMPAIGN`,
      operations: [
        {
          update: {
            resourceName: campaignResource,
            status: providerStatus,
          },
          updateMask: "status",
        },
      ],
    });

    const updated = await updateManagedMediaCampaign({
      organization_id: organizationId,
      id: campaign.id,
      updates: {
        status: nextStatus,
        metadata: {
          ...(campaign.metadata || {}),
          activation_required: nextStatus !== "ACTIVE",
          last_provider_status_change_at: new Date().toISOString(),
        },
      },
    });

    return { success: true, campaign: updated };
  },
};
