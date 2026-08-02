import {
  listMarketingChannels,
} from "@/lib/marketing/campaigns/MarketingChannelCatalog";

import {
  MetaAdsRuntime,
} from "@/lib/marketing/services/MetaAdsRuntime";

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

import {
  getProvider,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry.js";

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

  if (service && !activeService(service)) {
    reasons.push("Organization service is not active");
  }

  const available = Boolean(
    runtimeProviders.length &&
      matchingConnections.length &&
      (!service || activeService(service)),
  );

  return {
    available,
    state: available ? "READY" : "CONNECTION_OR_SERVICE_REQUIRED",
    reasons,
  };
}

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

  return {
    id: channel.id,
    name: channel.name,
    kind: channel.kind,
    provider: channel.provider,
    capability: channel.capability,
    service_id: channel.service_id,
    catalog_runtime_status: channel.runtime_status,
    available: availability.available,
    readiness_state: availability.state,
    reasons: availability.reasons,
    service_status: service?.status || "NOT_INSTALLED",
    provider_states: providerStates,
    connected_provider_ids: providers.filter((providerId) =>
      connections.some(
        (connection) =>
          activeConnection(connection) &&
          text(connection.provider).toLowerCase() === providerId,
      ),
    ),
    available_networks: availability.available
      ? activeNetworks(channel, providers)
      : [],
    networks: [...(channel.networks || [])],
    destinations: [...(channel.destinations || [])],
    formats: [...(channel.formats || [])],
  };
}

function metaChannelReadiness({ channel, service, meta }) {
  const availableDelivery = (meta?.delivery_channels || [])
    .filter((item) => item.available)
    .map((item) => item.id);
  const availableDestinations = (meta?.destinations || [])
    .filter((item) => item.available)
    .map((item) => item.id);

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
    formats: [...(channel.formats || [])],
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

export const MarketingCampaignReadinessRuntime = {
  async readiness({ organizationId }) {
    required(organizationId, "Organization id");

    const [
      services,
      connections,
      assets,
      wallet,
      meta,
    ] = await Promise.all([
      listOrganizationServices(organizationId).catch(() => []),
      ChannelConnectionRuntime.list(organizationId).catch(() => []),
      creativeAssets(organizationId).catch(() => []),
      WalletRepository.getByOrganization(organizationId).catch(() => null),
      MetaAdsRuntime.readiness({ organizationId }).catch((error) => ({
        connected: false,
        blockers: [error?.message || "Meta readiness could not be resolved"],
        creative_assets: [],
        campaigns: [],
      })),
    ]);

    const serviceIndex = rowsBy(services, "service_id");
    const catalog = listMarketingChannels();
    const channels = catalog.map((channel) => {
      const service = serviceIndex.get(text(channel.service_id).toLowerCase()) || null;
      return channel.id === "meta"
        ? metaChannelReadiness({ channel, service, meta })
        : genericChannelReadiness({ channel, service, connections });
    });

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
      creative_assets: assets,
      campaigns: meta?.campaigns || [],
      provider_specific: {
        meta: {
          connected: Boolean(meta?.connected),
          blockers: meta?.blockers || [],
          delivery_channels: meta?.delivery_channels || [],
          destinations: meta?.destinations || [],
        },
      },
    };
  },
};

export default MarketingCampaignReadinessRuntime;
