import {
  listMarketingChannels,
} from "@/lib/marketing/campaigns/MarketingChannelCatalog";

import {
  getMarketingCampaignAdapter,
} from "@/lib/marketing/campaigns/adapters/MarketingCampaignAdapterRegistry";

import {
  MetaAdsRuntime,
} from "@/lib/marketing/services/MetaAdsRuntime";
import {
  GoogleAdsRuntime,
} from "@/lib/marketing/services/GoogleAdsRuntime";

import {
  ChannelConnectionRuntime,
} from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";

import {
  listByOrganization as listOrganizationServices,
} from "@/lib/platform/service-runtime/services/repositories/OrganizationServiceRepository";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  WalletRepository,
} from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";

import "@/lib/platform/service-runtime/providers/google/GoogleProviderRegistration";
import {
  getProvider,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry.js";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveProvider } from "@/lib/platform/service-runtime/providers/ProviderResolver";
import { PricingRuntime } from "@/lib/platform/service-runtime/pricing/PricingRuntime";
import { MarketingCampaignUnsubscribeRuntime } from "@/lib/marketing/campaigns/MarketingCampaignUnsubscribeRuntime";
import { resolveOrganizationTimeContext } from "@/lib/shared/time/organizationTime";

function required(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${label} is required`);
  }
  return value;
}

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function sourceUrl(asset = {}) {
  return (
    asset.file_url ||
    asset.image_url ||
    asset.url ||
    asset.thumbnail_url ||
    null
  );
}

function assetKind(asset = {}) {
  const mime = text(
    asset.mime_type || asset.metadata?.mime_type || asset.analysis?.mime_type,
  ).toLowerCase();
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const url = text(sourceUrl(asset)).toLowerCase();

  if (
    mime.startsWith("video/") ||
    type.includes("video") ||
    /\.(mp4|mov|m4v|webm)(\?|$)/.test(url)
  ) {
    return "VIDEO";
  }

  if (
    mime.startsWith("audio/") ||
    type.includes("audio") ||
    /\.(mp3|wav|m4a|aac|flac|ogg)(\?|$)/.test(url)
  ) {
    return "AUDIO";
  }

  if (
    mime === "application/pdf" ||
    type.includes("document") ||
    /\.pdf(\?|$)/.test(url)
  ) {
    return "DOCUMENT";
  }

  if (
    asset.image_url ||
    mime.startsWith("image/") ||
    type.includes("image") ||
    type.includes("poster") ||
    type.includes("campaign") ||
    /\.(png|jpe?g|webp)(\?|$)/.test(url)
  ) {
    return "IMAGE";
  }

  return "FILE";
}

function approvalStatus(asset = {}) {
  const metadata = object(asset.metadata);
  const review = object(asset.review || metadata.review);
  const approved = Boolean(
    metadata.owner_approved === true ||
      metadata.brand_approved === true ||
      metadata.approved === true ||
      review.approved === true ||
      review.human_reviewed === true,
  );

  return approved ? "APPROVED" : "EXPLICIT_CONFIRMATION_REQUIRED";
}

function publicAsset(asset = {}) {
  const url = sourceUrl(asset);
  return {
    id: asset.id,
    name:
      asset.name ||
      asset.title ||
      asset.file_name ||
      "Untitled creative asset",
    asset_type: asset.asset_type || null,
    media_kind: assetKind(asset),
    approval_status: approvalStatus(asset),
    favorite: Boolean(asset.favorite),
    preview_url: asset.thumbnail_url || asset.image_url || url,
    source_available: Boolean(url),
    created_at: asset.created_at || null,
  };
}

async function channelAssets(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,connection_id,channel_provider,asset_type,external_id,name,entity_id,selected_at,metadata")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((asset) => ({
    id: asset.id,
    connection_id: asset.connection_id || null,
    provider: text(asset.channel_provider).toLowerCase() || null,
    asset_type: asset.asset_type || null,
    external_id: asset.external_id || null,
    name: asset.name || asset.external_id || asset.asset_type || "Channel asset",
    entity_id: asset.entity_id || null,
    selected_at: asset.selected_at || null,
    metadata: {
      username: asset.metadata?.username || asset.metadata?.instagram_username || null,
      from_number: asset.metadata?.from_number || null,
      phone_number: asset.metadata?.phone_number || asset.metadata?.display_phone_number || null,
      customer_id: asset.metadata?.customer_id || null,
      currency_code: asset.metadata?.currency_code || null,
      time_zone: asset.metadata?.time_zone || null,
      login_customer_id: asset.metadata?.login_customer_id || null,
      facebook_page_id: asset.metadata?.facebook_page_id || asset.metadata?.page_id || null,
      instagram_business_id: asset.metadata?.instagram_business_id || null,
      instagram_username: asset.metadata?.instagram_username || null,
      assignment_status: asset.metadata?.assignment_status || null,
      manager: asset.metadata?.manager === true,
    },
  }));
}

async function creativeAssets(organizationId) {
  const assets = await CreativeAssetsRuntime.list({
    organization_id: organizationId,
    limit: 500,
  });

  return (assets || [])
    .filter((asset) => !asset.archived && sourceUrl(asset))
    .sort((left, right) => {
      if (Boolean(left.favorite) !== Boolean(right.favorite)) {
        return left.favorite ? -1 : 1;
      }
      return new Date(right.created_at || 0) - new Date(left.created_at || 0);
    })
    .map(publicAsset);
}

function rowsBy(rows = [], key) {
  return new Map(
    rows
      .filter(Boolean)
      .map((row) => [text(row?.[key]).toLowerCase(), row]),
  );
}

function activeConnection(connection) {
  return upper(connection?.status) === "ACTIVE";
}

function activeService(service) {
  return Boolean(
    upper(service?.status) === "ACTIVE" &&
      service?.usage_enabled !== false,
  );
}

function providerState(providerId, capability) {
  const provider = getProvider(providerId);
  if (!provider) {
    return {
      id: providerId,
      registered: false,
      active: false,
      runtime_available: false,
      capability_available: false,
    };
  }

  return {
    id: provider.id,
    registered: true,
    active: provider.active !== false,
    runtime_available: provider.runtimeAvailable !== false,
    capability_available: Array.isArray(provider.capabilities)
      ? provider.capabilities.includes(capability)
      : false,
  };
}

function candidateProviders(channel, connections) {
  if (channel.provider !== "multi") {
    return [channel.provider];
  }

  return [...new Set(
    (connections || [])
      .filter(activeConnection)
      .map((connection) => text(connection.provider).toLowerCase())
      .filter(Boolean),
  )];
}

function providerNetworkMap(providerId) {
  const map = {
    meta: ["facebook", "instagram", "messenger", "audience_network"],
    google: ["google_business", "youtube"],
    google_ads: ["search"],
    tiktok: ["tiktok"],
    linkedin: ["linkedin"],
    x: ["x"],
    pinterest: ["pinterest"],
    whatsapp: ["whatsapp"],
    line: ["line"],
    telegram: ["telegram"],
    email: ["email"],
    sms: ["sms"],
    push: ["ios", "android", "web_push"],
  };

  return map[providerId] || [providerId];
}

function activeNetworks(channel, providers) {
  if (channel.id === "meta") return [];

  const allowed = new Set(channel.networks || []);
  return [...new Set(
    providers.flatMap(providerNetworkMap).filter((network) => allowed.has(network)),
  )];
}

function unavailableState(channel, service, providerStates, connections) {
  const reasons = [];
  const runtimeStatus = upper(channel.runtime_status);

  if (runtimeStatus === "NOT_REGISTERED") {
    reasons.push("Channel provider and execution adapter are not registered");
    return { available: false, state: "NOT_REGISTERED", reasons };
  }

  if (runtimeStatus === "IMPLEMENTATION_REQUIRED") {
    reasons.push("Channel execution adapter is not implemented");
    return { available: false, state: "IMPLEMENTATION_REQUIRED", reasons };
  }

  const registeredProviders = providerStates.filter((state) => state.registered);
  const runtimeProviders = registeredProviders.filter(
    (state) => state.active && state.runtime_available && state.capability_available,
  );
  const matchingConnections = (connections || []).filter(
    (connection) =>
      activeConnection(connection) &&
      providerStates.some((state) => state.id === text(connection.provider).toLowerCase()),
  );

  if (!registeredProviders.length) {
    reasons.push("No registered provider supports this channel");
  } else if (!runtimeProviders.length) {
    reasons.push("Provider runtime or required capability is unavailable");
  }

  if (!matchingConnections.length) {
    reasons.push("Organization channel connection is required");
  }

  if (channel.service_id && !service) {
    reasons.push("Organization service is not installed");
  } else if (service && !activeService(service)) {
    reasons.push("Organization service is not active");
  }

  const available = Boolean(
    runtimeProviders.length &&
      matchingConnections.length &&
      (!channel.service_id || activeService(service)),
  );

  return {
    available,
    state: available ? "READY" : "CONNECTION_OR_SERVICE_REQUIRED",
    reasons,
  };
}

async function tableAvailable(table) {
  const result = await supabaseAdmin.from(table).select("id").limit(1);
  if (!result.error) return true;
  const code = text(result.error?.code).toUpperCase();
  const message = text(result.error?.message);
  if (["PGRST205", "42P01"].includes(code) || new RegExp(table, "i").test(message) && /does not exist|schema cache|could not find/i.test(message)) return false;
  throw result.error;
}

async function ownedMessagingGovernanceReadiness() {
  const [consentTable, deliveryLedger] = await Promise.all([
    tableAvailable("marketing_channel_preferences").catch(() => false),
    tableAvailable("marketing_campaign_message_deliveries").catch(() => false),
  ]);
  const unsubscribe = MarketingCampaignUnsubscribeRuntime.readiness();
  return {
    consent_table_ready: consentTable,
    delivery_ledger_ready: deliveryLedger,
    unsubscribe_ready: unsubscribe.ready,
    unsubscribe_blockers: unsubscribe.blockers || [],
  };
}

const CAMPAIGN_GOVERNANCE_BLOCKERS = Object.freeze({
  email: "Connected mailbox can send operational email, but campaign broadcast requires certified channel-specific consent, suppression and unsubscribe governance.",
  whatsapp: "WhatsApp can send operational messages, but campaign broadcast requires certified opt-in, template/window and suppression governance.",
  line: "LINE can send operational messages, but campaign broadcast requires certified recipient consent, suppression and frequency governance.",
  telegram: "Telegram can send operational messages, but campaign broadcast requires certified subscriber consent, suppression and frequency governance.",
  sms: "SMS can send operational messages, but campaign broadcast requires certified phone consent, suppression and frequency governance.",
});

function genericChannelReadiness({
  channel,
  service,
  connections,
}) {
  const providers = candidateProviders(channel, connections);
  const providerStates = providers.map((providerId) =>
    providerState(providerId, channel.capability),
  );
  const availability = unavailableState(
    channel,
    service,
    providerStates,
    connections,
  );
  const campaignAdapter = getMarketingCampaignAdapter(channel.id);
  const campaignExecutable = Boolean(campaignAdapter && campaignAdapter.status === "ACTIVE");
  const adapterNetworks = new Set(Array.isArray(campaignAdapter?.networks) ? campaignAdapter.networks : []);
  const connectedNetworks = activeNetworks(channel, providers);
  const executableNetworks = adapterNetworks.size
    ? connectedNetworks.filter((network) => adapterNetworks.has(network))
    : connectedNetworks;
  const networkExecutionReady = channel.provider !== "multi" || executableNetworks.length > 0;
  const executionAvailable = Boolean(availability.available && campaignExecutable && networkExecutionReady);
  const reasons = [...availability.reasons];
  if (availability.available && !campaignExecutable) {
    reasons.push(
      CAMPAIGN_GOVERNANCE_BLOCKERS[channel.id] ||
      "Channel connection is available, but no active campaign execution adapter is registered",
    );
  } else if (availability.available && campaignExecutable && !networkExecutionReady) {
    reasons.push("Connected networks are not enabled by the current campaign execution adapter");
  }

  return {
    id: channel.id,
    name: channel.name,
    kind: channel.kind,
    provider: channel.provider,
    capability: channel.capability,
    service_id: channel.service_id,
    catalog_runtime_status: channel.runtime_status,
    available: executionAvailable,
    readiness_state: executionAvailable
      ? "READY"
      : availability.available && !campaignExecutable
        ? "PLANNING_ONLY"
        : availability.state,
    reasons,
    service_status: service?.status || "NOT_INSTALLED",
    provider_states: providerStates,
    connected_provider_ids: providers.filter((providerId) =>
      connections.some(
        (connection) =>
          activeConnection(connection) &&
          text(connection.provider).toLowerCase() === providerId,
      ),
    ),
    available_networks: executionAvailable
      ? executableNetworks
      : [],
    networks: [...(channel.networks || [])],
    destinations: [...(channel.destinations || [])],
    formats: [...(channel.formats || [])],
    adapter: campaignAdapter?.version || null,
    campaign_execution_available: campaignExecutable,
  };
}

const OWNED_MESSAGING_CHANNELS = new Set(["email", "whatsapp", "line", "telegram", "sms"]);

function ownedMessagingChannelReadiness({ channel, service, connections, governance }) {
  const base = genericChannelReadiness({ channel, service, connections });
  const reasons = [...base.reasons];
  if (!governance?.consent_table_ready) reasons.push("Campaign consent governance migration is not deployed");
  if (!governance?.delivery_ledger_ready) reasons.push("Campaign message delivery ledger migration is not deployed");
  if (channel.id === "email" && !governance?.unsubscribe_ready) {
    for (const blocker of governance?.unsubscribe_blockers || []) {
      if (blocker === "MARKETING_UNSUBSCRIBE_SECRET_REQUIRED") reasons.push("Email campaign unsubscribe secret is not configured");
      else if (blocker === "APPLICATION_ORIGIN_REQUIRED") reasons.push("Email campaign application origin is not configured");
      else reasons.push(blocker);
    }
  }
  const adapter = getMarketingCampaignAdapter(channel.id);
  if (!adapter || adapter.status !== "ACTIVE") reasons.push("Owned messaging campaign adapter activation gate remains closed");
  return {
    ...base,
    available: false,
    readiness_state: "PLANNING_ONLY",
    reasons: [...new Set(reasons)],
    available_networks: [],
    campaign_execution_available: false,
    adapter: adapter?.version || null,
    details: {
      ...(base.details || {}),
      governance: {
        consent_table_ready: Boolean(governance?.consent_table_ready),
        delivery_ledger_ready: Boolean(governance?.delivery_ledger_ready),
        unsubscribe_ready: channel.id === "email" ? Boolean(governance?.unsubscribe_ready) : null,
        adapter_status: adapter?.status || "UNAVAILABLE",
      },
    },
  };
}

const ORGANIC_SOCIAL_NETWORK_RUNTIME = Object.freeze({
  facebook: { provider: "meta", service_id: "facebook", capability: "marketing.facebook.publish", asset_provider: "meta", asset_type: "facebook_page" },
  instagram: { provider: "meta", service_id: "instagram", capability: "marketing.instagram.publish", asset_provider: "meta", asset_type: "instagram_business" },
  pinterest: { provider: "pinterest", service_id: "pinterest", capability: "marketing.pinterest.publish", asset_provider: "pinterest", asset_type: "pinterest_account" },
  youtube: { provider: "youtube", service_id: "youtube", capability: "marketing.youtube.publish", asset_provider: "youtube", asset_type: "youtube_channel" },
  linkedin: { provider: "linkedin", service_id: "linkedin", capability: "marketing.linkedin.publish", asset_provider: "linkedin", asset_type: "linkedin_identity" },
  threads: { provider: "threads", service_id: "threads", capability: "marketing.threads.publish", asset_provider: "threads", asset_type: "threads_profile" },
  tiktok: { provider: "tiktok", service_id: "tiktok", capability: "marketing.tiktok.publish", asset_provider: "tiktok", asset_type: "tiktok_account" },
  google_business: { provider: "google", service_id: "google-business", capability: "marketing.google.business.publish", asset_provider: "google", asset_type: "google_business_location" },
  x: { provider: "x", service_id: "x", capability: "marketing.x.publish", asset_provider: "x", asset_type: "x_account" },
});

async function organicSocialChannelReadiness({ channel, organizationId, services = [], connections = [], channelAssets = [], wallet = null }) {
  const adapter = getMarketingCampaignAdapter(channel.id);
  const adapterNetworks = Array.isArray(adapter?.networks) ? adapter.networks : [];
  const serviceIndex = rowsBy(services, "service_id");
  const availableNetworks = [];
  const networkStates = [];

  for (const network of adapterNetworks) {
    const runtime = ORGANIC_SOCIAL_NETWORK_RUNTIME[network];
    if (!runtime) continue;
    const provider = providerState(runtime.provider, runtime.capability);
    const service = serviceIndex.get(runtime.service_id) || null;
    const connected = connections.some((connection) =>
      activeConnection(connection) && text(connection.provider).toLowerCase() === runtime.provider,
    );
    const matchingAssets = (channelAssets || []).filter((asset) =>
      text(asset.provider).toLowerCase() === runtime.asset_provider &&
      text(asset.asset_type) === runtime.asset_type,
    );
    const assetReady = matchingAssets.length > 0;
    const baseReady = Boolean(
      provider.registered &&
      provider.active &&
      provider.runtime_available &&
      provider.capability_available &&
      connected &&
      assetReady &&
      activeService(service),
    );
    let pricingReady = false;
    let pricingSummary = null;
    let pricingError = null;
    if (baseReady) {
      try {
        const selected = await resolveProvider({
          organization_id: organizationId,
          capability: runtime.capability,
          preferredProvider: runtime.provider,
          currency: wallet?.currency || null,
          policy: service?.provider_policy || {},
        });
        const pricing = PricingRuntime.resolveRecord({
          pricing: selected.pricing_record,
          provider: selected.provider,
          model: selected.model,
          capability: runtime.capability,
          currency: wallet?.currency || null,
          usage: { quantity: 1 },
        });
        pricingReady = true;
        pricingSummary = {
          pricing_id: pricing.pricing_id,
          customer_price: pricing.customer_price,
          currency: pricing.currency,
          zero_price: pricing.zero_price === true,
        };
      } catch (error) {
        pricingError = error?.message || "Pricing route unavailable";
      }
    }
    const ready = Boolean(baseReady && pricingReady);
    if (ready) availableNetworks.push(network);
    networkStates.push({
      network,
      provider: runtime.provider,
      capability: runtime.capability,
      service_id: runtime.service_id,
      connected,
      asset_ready: assetReady,
      asset_count: matchingAssets.length,
      asset_provider: runtime.asset_provider,
      asset_type: runtime.asset_type,
      service_status: service?.status || "NOT_INSTALLED",
      provider_state: provider,
      pricing_ready: pricingReady,
      pricing: pricingSummary,
      pricing_error: pricingError,
      ready,
    });
  }

  const available = availableNetworks.length > 0;
  const reasons = [];
  if (!adapter || adapter.status !== "ACTIVE") reasons.push("Organic social campaign adapter is not active");
  if (!available && adapterNetworks.length) reasons.push("Connect and enable at least one campaign-supported organic social network");

  return {
    id: channel.id,
    name: channel.name,
    kind: channel.kind,
    provider: channel.provider,
    capability: channel.capability,
    service_id: channel.service_id,
    catalog_runtime_status: channel.runtime_status,
    available,
    readiness_state: available ? "READY" : "CONNECTION_OR_SERVICE_REQUIRED",
    reasons,
    service_status: available ? "ACTIVE" : "NETWORK_DEPENDENT",
    provider_states: networkStates.map((state) => state.provider_state),
    connected_provider_ids: networkStates.filter((state) => state.connected).map((state) => state.provider),
    available_networks: availableNetworks,
    networks: [...(channel.networks || [])],
    destinations: [...(channel.destinations || [])],
    formats: [...(channel.formats || [])],
    adapter: adapter?.version || null,
    campaign_execution_available: Boolean(adapter && adapter.status === "ACTIVE"),
    details: { network_states: networkStates },
  };
}

function metaChannelReadiness({ channel, service, meta }) {
  const availableDelivery = (meta?.delivery_channels || [])
    .filter((item) => item.available)
    .map((item) => item.id)
    .filter((id) => ["facebook", "instagram"].includes(id));
  const availableDestinations = (meta?.destinations || [])
    .filter((item) => item.available)
    .map((item) => item.id)
    .filter((id) => ["ENGAGEMENT", "WEBSITE", "WHATSAPP"].includes(String(id).toUpperCase()));

  return {
    id: channel.id,
    name: channel.name,
    kind: channel.kind,
    provider: channel.provider,
    capability: channel.capability,
    service_id: channel.service_id,
    catalog_runtime_status: channel.runtime_status,
    available: Boolean(meta?.connected),
    readiness_state: meta?.connected ? "READY" : "BLOCKED",
    reasons: meta?.connected ? [] : [...(meta?.blockers || [])],
    service_status: service?.status || meta?.service_status || "NOT_INSTALLED",
    provider_states: [
      {
        id: "meta",
        registered: true,
        active: meta?.managed_provider_status === "READY",
        runtime_available: meta?.managed_provider_status === "READY",
        capability_available: true,
      },
    ],
    connected_provider_ids: meta?.channel_status === "ACTIVE" ? ["meta"] : [],
    available_networks: availableDelivery,
    networks: [...(channel.networks || [])],
    available_destinations: availableDestinations,
    destinations: [...(channel.destinations || [])],
    formats: ["IMAGE"],
    catalog_formats: [...(channel.formats || [])],
    adapter: "META_MANAGED_MEDIA_V1",
    details: {
      page_id: meta?.page_id || null,
      instagram_business_id: meta?.instagram_business_id || null,
      whatsapp_destination: meta?.whatsapp_destination || null,
      managed_by: meta?.managed_by || "AVANTIQO",
      provider_billed_to: meta?.provider_billed_to || "AVANTIQO",
    },
  };
}

function googleAdsChannelReadiness({ channel, service, googleAds }) {
  const provider = providerState("google_ads", channel.capability);
  const available = Boolean(googleAds?.ready && provider.capability_available);

  return {
    id: channel.id,
    name: channel.name,
    kind: channel.kind,
    provider: channel.provider,
    capability: channel.capability,
    service_id: channel.service_id,
    catalog_runtime_status: channel.runtime_status,
    available,
    readiness_state: available ? "READY" : "BLOCKED",
    reasons: available ? [] : [...(googleAds?.blockers || [])],
    service_status: service?.status || googleAds?.service_status || "NOT_INSTALLED",
    provider_states: [provider],
    connected_provider_ids:
      googleAds?.connection_status === "ACTIVE" ? ["google_ads"] : [],
    available_networks: available ? ["search"] : [],
    networks: [...(channel.networks || [])],
    available_destinations: available ? [...(channel.destinations || [])] : [],
    destinations: [...(channel.destinations || [])],
    formats: [...(channel.formats || [])],
    adapter: "GOOGLE_ADS_MANAGED_SEARCH_V1",
    details: {
      accounts: googleAds?.accounts || [],
      wallet: googleAds?.wallet || null,
      managed_by: "AVANTIQO",
      provider_billed_to: "AVANTIQO",
      execution_mode: "PAUSED_FIRST",
    },
  };
}

export const MarketingCampaignReadinessRuntime = {
  async readiness({ organizationId }) {
    required(organizationId, "Organization id");

    const [
      services,
      connections,
      assets,
      channelAssetRows,
      wallet,
      meta,
      googleAds,
      ownedMessagingGovernance,
      timeContext,
    ] = await Promise.all([
      listOrganizationServices(organizationId).catch(() => []),
      ChannelConnectionRuntime.list(organizationId).catch(() => []),
      creativeAssets(organizationId).catch(() => []),
      channelAssets(organizationId).catch(() => []),
      WalletRepository.getByOrganization(organizationId).catch(() => null),
      MetaAdsRuntime.readiness({ organizationId }).catch((error) => ({
        connected: false,
        blockers: [error?.message || "Meta readiness could not be resolved"],
        creative_assets: [],
        campaigns: [],
      })),
      GoogleAdsRuntime.readiness({ organizationId }).catch((error) => ({
        ready: false,
        blockers: [error?.message || "Google Ads readiness could not be resolved"],
        accounts: [],
        campaigns: [],
      })),
      ownedMessagingGovernanceReadiness(),
      resolveOrganizationTimeContext({ organizationId }),
    ]);

    const serviceIndex = rowsBy(services, "service_id");
    const catalog = listMarketingChannels();
    const channels = await Promise.all(catalog.map(async (channel) => {
      const service = serviceIndex.get(text(channel.service_id).toLowerCase()) || null;
      if (channel.id === "meta") {
        return metaChannelReadiness({ channel, service, meta });
      }
      if (channel.id === "google_ads") {
        return googleAdsChannelReadiness({ channel, service, googleAds });
      }
      if (channel.id === "organic_social") {
        return organicSocialChannelReadiness({ channel, organizationId, services, connections, channelAssets: channelAssetRows, wallet });
      }
      if (OWNED_MESSAGING_CHANNELS.has(channel.id)) {
        return ownedMessagingChannelReadiness({ channel, service, connections, governance: ownedMessagingGovernance });
      }
      return genericChannelReadiness({ channel, service, connections });
    }));

    const connectedChannels = channels
      .filter((channel) => channel.available)
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        kind: channel.kind,
        provider: channel.provider,
        capability: channel.capability,
        service_id: channel.service_id,
        networks: channel.available_networks || [],
        destinations: channel.available_destinations || channel.destinations || [],
        formats: channel.formats || [],
        readiness_state: channel.readiness_state,
      }));

    return {
      organization_id: organizationId,
      ready_channel_count: connectedChannels.length,
      connected_channels: connectedChannels,
      channels,
      wallet: wallet
        ? {
            status: wallet.status,
            currency: wallet.currency,
            available_balance: Number(wallet.available_balance || 0),
            reserved_balance: Number(wallet.reserved_balance || 0),
          }
        : null,
      time_context: {
        timezone: timeContext?.timezone || "UTC",
        currency: timeContext?.currency || null,
      },
      creative_assets: assets,
      channel_assets: channelAssetRows,
      campaigns: [
        ...(meta?.campaigns || []),
        ...(googleAds?.campaigns || []),
      ],
      provider_specific: {
        meta: {
          connected: Boolean(meta?.connected),
          blockers: meta?.blockers || [],
          delivery_channels: meta?.delivery_channels || [],
          destinations: meta?.destinations || [],
        },
        google_ads: {
          connected: googleAds?.connection_status === "ACTIVE",
          ready: Boolean(googleAds?.ready),
          blockers: googleAds?.blockers || [],
          accounts: googleAds?.accounts || [],
          wallet: googleAds?.wallet || null,
        },
        owned_messaging: ownedMessagingGovernance,
      },
    };
  },
};

export default MarketingCampaignReadinessRuntime;
