import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

export const GOOGLE_BUSINESS_SCOPE =
  "https://www.googleapis.com/auth/business.manage";

function serviceOutput(execution) {
  return execution?.output?.output || {};
}

function organizationFromLegacyContext(value) {
  if (value && typeof value === "object") {
    return String(value.organizationId || value.organization_id || "").trim();
  }
  return String(value || "").trim();
}

export async function getGoogleBusinessConnection({ organizationId }) {
  const connection = await ChannelConnectionRuntime.get({
    organization_id: organizationId,
    provider: "google",
  });

  if (!connection || String(connection.status || "").toUpperCase() !== "ACTIVE") {
    throw new Error("Google Business Profile is not connected");
  }
  if (!connection.credentials_reference) {
    throw new Error("Google Business Profile credential is missing");
  }

  return connection;
}

// Compatibility bridge for older callers. No provider credential or Google
// access token leaves the Service Domain; accessToken is an opaque org context.
export async function getGoogleBusinessAccess({ organizationId }) {
  const connection = await getGoogleBusinessConnection({ organizationId });
  return {
    connection,
    credential: null,
    accessToken: { organizationId },
  };
}

export async function discoverGoogleBusinessLocations({ organizationId }) {
  const execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    service_id: "google-business",
    provider_id: "google",
    capability: "marketing.google.business.locations.read",
    input: {},
    category: "MARKETING",
    metadata: {
      module: "GOOGLE_BUSINESS_PROFILE",
      operation: "DISCOVER_LOCATIONS",
    },
  });

  const output = serviceOutput(execution);
  return {
    accounts: Array.isArray(output.accounts) ? output.accounts : [],
    locations: Array.isArray(output.locations) ? output.locations : [],
  };
}

export async function discoverAndRegisterGoogleBusinessLocations({
  organizationId,
  connection = null,
}) {
  const activeConnection =
    connection || (await getGoogleBusinessConnection({ organizationId }));
  const discovery = await discoverGoogleBusinessLocations({ organizationId });

  if (!discovery.locations.length) {
    throw new Error(
      "No verified Google Business Profile locations were available for this account"
    );
  }

  const assets = [];
  for (const location of discovery.locations) {
    const existing = await ChannelAssetRuntime.find({
      organization_id: organizationId,
      provider: "google",
      asset_type: "google_business_location",
      external_id: location.review_parent,
    });

    const entityId = existing?.entity_id || existing?.metadata?.entity_id || null;
    const selectedByPartyId = existing?.selected_by_party_id || null;
    const selectedAt = existing?.selected_at || null;

    assets.push(
      await ChannelAssetRuntime.register({
        organization_id: organizationId,
        connection_id: activeConnection.id,
        provider: "google",
        asset_type: "google_business_location",
        external_id: location.review_parent,
        name: location.title || location.storeCode || location.review_parent,
        entity_id: entityId,
        selected_by_party_id: selectedByPartyId,
        selected_at: selectedAt,
        metadata: {
          ...(existing?.metadata || {}),
          account_name: location.account_name,
          account_title: location.account_title,
          location_name: location.name,
          review_parent: location.review_parent,
          store_code: location.storeCode || null,
          website_uri: location.websiteUri || null,
          maps_uri: location.metadata?.mapsUri || null,
          new_review_uri: location.metadata?.newReviewUri || null,
          phone_numbers: location.phoneNumbers || null,
          entity_id: entityId,
        },
      })
    );
  }

  const updatedConnection = await ChannelConnectionRuntime.connect({
    organization_id: organizationId,
    provider: "google",
    channel_type: activeConnection.channel_type || "business-profile",
    credentials_reference: activeConnection.credentials_reference,
    metadata: {
      ...(activeConnection.metadata || {}),
      accounts: discovery.accounts.map((account) => ({
        name: account.name,
        title: account.accountName || null,
        type: account.type || null,
      })),
      location_count: discovery.locations.length,
      location_discovery_status: "READY",
      location_discovery_error: null,
      location_discovery_retry_at: null,
      location_discovered_at: new Date().toISOString(),
    },
  });

  return { ...discovery, assets, connection: updatedConnection };
}

export async function listGoogleLocationReviews({
  organizationId = null,
  accessToken = null,
  reviewParent,
  maxReviews = null,
}) {
  const resolvedOrganizationId =
    String(organizationId || "").trim() || organizationFromLegacyContext(accessToken);
  if (!resolvedOrganizationId) {
    throw new Error("organizationId is required for governed Google review access");
  }

  const execution = await ServiceExecutionRuntime.execute({
    organization_id: resolvedOrganizationId,
    service_id: "google-business",
    provider_id: "google",
    capability: "reputation.review.read",
    input: {
      review_parent: reviewParent,
      max_reviews: maxReviews,
    },
    category: "REPUTATION",
    metadata: {
      module: "COMMERCIAL_REPUTATION",
      operation: "READ_GOOGLE_REVIEWS",
      review_parent: reviewParent,
    },
  });

  const output = serviceOutput(execution);
  return Array.isArray(output.reviews) ? output.reviews : [];
}

export async function publishGoogleReviewReply({
  organizationId,
  reviewName,
  comment,
}) {
  const execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    service_id: "google-business",
    provider_id: "google",
    capability: "reputation.review.reply",
    input: {
      review_name: reviewName,
      comment,
    },
    category: "REPUTATION",
    metadata: {
      module: "COMMERCIAL_REPUTATION",
      operation: "PUBLISH_GOOGLE_REVIEW_REPLY",
      review_name: reviewName,
    },
  });

  return serviceOutput(execution);
}
