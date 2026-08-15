export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { listCustomerIntegrations } from "@/lib/platform/channels/CustomerIntegrationCatalog";
import {
  checkBusinessConnectionPlatformReadiness,
  getBusinessConnection,
} from "@/lib/platform/channels/BusinessConnectionRegistry";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PLATFORM_ROLES = new Set(["PLATFORM_OWNER", "SUPER_ADMIN"]);

function clean(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function safeAccountLabel(connection) {
  const metadata = connection?.metadata && typeof connection.metadata === "object"
    ? connection.metadata
    : {};
  return (
    clean(metadata.page_name) ||
    clean(metadata.instagram_username) ||
    clean(metadata.username) ||
    clean(metadata.email) ||
    clean(metadata.account_name) ||
    clean(metadata.account_title) ||
    clean(metadata.business_name) ||
    clean(metadata.shop) ||
    null
  );
}

function isActive(row) {
  return upper(row?.status) === "ACTIVE";
}

function readyCapability(id, label, detail = null) {
  return { id, label, status: "READY", detail };
}

function setupCapability(id, label, detail = null) {
  return { id, label, status: "SETUP_REQUIRED", detail };
}

function unavailableCapability(id, label, detail = null) {
  return { id, label, status: "NOT_AVAILABLE", detail };
}

function assignedMetaAssets(assets) {
  const metaAssets = assets.filter((row) => row.channel_provider === "meta");
  const facebookAssets = metaAssets.filter((row) => row.asset_type === "facebook_page");
  const instagramAssets = metaAssets.filter((row) => row.asset_type === "instagram_business");

  const instagramPageIds = new Set(
    instagramAssets
      .map((row) => clean(row?.metadata?.facebook_page_id))
      .filter(Boolean),
  );

  const facebookPage =
    facebookAssets.find((row) =>
      clean(row?.metadata?.identity_connection_model) === "MANAGED_ASSET_ASSIGNMENT" ||
      clean(row?.metadata?.managed_ad_account_id),
    ) ||
    facebookAssets.find((row) => instagramPageIds.has(clean(row.external_id))) ||
    (facebookAssets.length === 1 ? facebookAssets[0] : null);

  const instagramBusiness =
    instagramAssets.find((row) =>
      clean(row?.metadata?.facebook_page_id) === clean(facebookPage?.external_id),
    ) ||
    (instagramAssets.length === 1 ? instagramAssets[0] : null);

  return { facebookPage, instagramBusiness };
}

function buildMetaStatus(integration, connections, assets, credentials) {
  const metaConnections = connections.filter((row) => row.provider === "meta" && isActive(row));
  const socialConnection =
    metaConnections.find((row) => upper(row.channel_type) === "SOCIAL") ||
    metaConnections.find((row) => upper(row.channel_type) !== "ADVERTISING") ||
    null;

  const { facebookPage, instagramBusiness } = assignedMetaAssets(assets);

  const socialCredential = socialConnection?.credentials_reference
    ? credentials.get(socialConnection.credentials_reference) || null
    : null;
  const credentialMetadata =
    socialCredential?.metadata && typeof socialCredential.metadata === "object"
      ? socialCredential.metadata
      : {};

  const credentialMatchesFacebook =
    Boolean(facebookPage) &&
    clean(credentialMetadata.page_id) === clean(facebookPage.external_id);
  const credentialMatchesInstagram =
    !instagramBusiness ||
    clean(credentialMetadata.instagram_business_id) === clean(instagramBusiness.external_id);

  const messagingCredentialReady =
    upper(socialCredential?.status) === "ACTIVE" &&
    socialCredential?.credential_type === "oauth_page_token" &&
    upper(credentialMetadata.purpose) === "ORGANIZATION_CHANNEL_PUBLISHING" &&
    credentialMetadata.messaging_webhook_subscribed === true &&
    credentialMetadata.messaging_app_webhooks_configured === true &&
    credentialMatchesFacebook &&
    credentialMatchesInstagram;

  const facebookReady = Boolean(socialConnection && facebookPage);
  const instagramReady = Boolean(socialConnection && instagramBusiness);
  const managedAdAccountId =
    clean(facebookPage?.metadata?.managed_ad_account_id) ||
    clean(instagramBusiness?.metadata?.managed_ad_account_id) ||
    clean(socialConnection?.metadata?.managed_ad_account_id) ||
    clean(metaConnections.find((row) => upper(row.channel_type) === "ADVERTISING")?.metadata?.managed_ad_account_id) ||
    null;
  const adsReady = Boolean(managedAdAccountId);

  const capabilities = [
    facebookReady
      ? readyCapability("facebook-page", "Facebook Page", facebookPage.name || null)
      : setupCapability("facebook-page", "Facebook Page", "Connect a business Facebook Page."),
    facebookReady
      ? readyCapability("facebook-publishing", "Facebook Posts / Publishing", "Page publishing identity is available.")
      : setupCapability("facebook-publishing", "Facebook Posts / Publishing", "Facebook Page connection is required."),
    messagingCredentialReady && facebookReady
      ? readyCapability("facebook-messenger", "Facebook Messenger", "Messenger webhook and reply credential are ready for this Page.")
      : setupCapability("facebook-messenger", "Facebook Messenger", "Reconnect Meta once to bind messaging to this organization's Facebook Page."),
    instagramReady
      ? readyCapability("instagram-publishing", "Instagram Posts / Reels", instagramBusiness.name || null)
      : unavailableCapability("instagram-publishing", "Instagram Posts / Reels", "No Instagram professional account is linked."),
    messagingCredentialReady && instagramReady
      ? readyCapability("instagram-messaging", "Instagram Messaging", "Instagram messaging is ready for this professional account.")
      : instagramReady
        ? setupCapability("instagram-messaging", "Instagram Messaging", "Reconnect Meta once to bind messaging to this organization's Instagram account.")
        : unavailableCapability("instagram-messaging", "Instagram Messaging", "No Instagram professional account is linked."),
    adsReady
      ? readyCapability("meta-ads", "Meta Ads", managedAdAccountId)
      : setupCapability("meta-ads", "Meta Ads", "Assign or connect the managed Meta ad account."),
  ];

  const hasBaseConnection = Boolean(socialConnection || facebookPage || instagramBusiness || adsReady);
  const needsMessagingSetup = capabilities.some(
    (capability) =>
      (capability.id === "facebook-messenger" || capability.id === "instagram-messaging") &&
      capability.status === "SETUP_REQUIRED",
  );

  if (!hasBaseConnection) {
    return {
      state: "ACTION_REQUIRED",
      label: "Not connected",
      detail: "Connect the Meta business identity used for Facebook, Instagram, messaging and advertising.",
      account: null,
      action: integration.connectPath ? "CONNECT" : null,
      actionLabel: "Connect Meta",
      capabilities,
    };
  }

  return {
    state: needsMessagingSetup ? "SETUP_IN_PROGRESS" : "CONNECTED",
    label: needsMessagingSetup ? "Messaging setup required" : "Connected",
    detail: needsMessagingSetup
      ? "Facebook, Instagram and Meta Ads are assigned, but messaging must be bound to this organization's exact Meta assets."
      : "Meta publishing, messaging and advertising capabilities are ready where configured.",
    account: facebookPage?.name || instagramBusiness?.name || safeAccountLabel(socialConnection) || null,
    action: needsMessagingSetup && integration.connectPath ? "CONNECT" : null,
    actionLabel: needsMessagingSetup ? "Reconnect Meta" : null,
    capabilities,
  };
}

function statusForIntegration(integration, connections, assets, credentials) {
  if (integration.id === "meta") {
    return buildMetaStatus(integration, connections, assets, credentials);
  }

  const matchingConnections = connections.filter((row) =>
    integration.connectionProviders.includes(row.provider),
  );
  const activeConnection = matchingConnections.find(
    (row) => upper(row.status) === "ACTIVE",
  ) || null;

  const matchingAssets = assets.filter((row) => {
    if (integration.assetProviders?.length && !integration.assetProviders.includes(row.channel_provider)) return false;
    if (integration.assetTypes?.length && !integration.assetTypes.includes(row.asset_type)) return false;
    return true;
  });

  if (integration.id === "google-business" && activeConnection) {
    const discovery = upper(activeConnection.metadata?.location_discovery_status);
    if (discovery && discovery !== "READY") {
      return {
        state: "SETUP_IN_PROGRESS",
        label: "Connected",
        detail: "Avantiqo is completing the remaining Google setup. No reconnect is required.",
        account: safeAccountLabel(activeConnection),
        action: integration.detailAnchor ? "MANAGE" : null,
      };
    }
  }

  if (integration.id === "google-ads") {
    const advertisers = matchingAssets.filter((asset) => asset?.metadata?.manager !== true);
    if (advertisers.length) {
      return {
        state: "CONNECTED",
        label: "Connected",
        detail: "Advertising account connected to this organization.",
        account: clean(advertisers[0]?.name) || safeAccountLabel(activeConnection),
        action: integration.detailAnchor ? "MANAGE" : null,
      };
    }
    if (activeConnection) {
      return {
        state: "SETUP_IN_PROGRESS",
        label: "Connected",
        detail: "Google Ads authorization is active. Select the advertiser account to finish setup.",
        account: safeAccountLabel(activeConnection),
        action: integration.detailAnchor ? "MANAGE" : null,
      };
    }
  }

  if (activeConnection) {
    return {
      state: "CONNECTED",
      label: "Connected",
      detail: "This business connection is active.",
      account: safeAccountLabel(activeConnection),
      action: integration.detailAnchor ? "MANAGE" : null,
    };
  }

  return {
    state: "ACTION_REQUIRED",
    label: "Not connected",
    detail: "Connect this business service when the organization wants to use it.",
    account: null,
    action: integration.connectPath ? "CONNECT" : null,
  };
}

function applyPlatformReadiness(integration, status) {
  const registry = getBusinessConnection(integration.id);
  if (!registry) return { ...status, platformReady: false };
  const readiness = checkBusinessConnectionPlatformReadiness(registry);
  if (readiness.ready) {
    return {
      ...status,
      platformReady: true,
      customerSetup: registry.customerSetup || null,
    };
  }

  const alreadyConnected = status.state === "CONNECTED" || status.state === "SETUP_IN_PROGRESS";
  return {
    ...status,
    state: "PLATFORM_SETUP",
    label: alreadyConnected ? "Avantiqo setup in progress" : "Available soon",
    detail: alreadyConnected
      ? "The business connection is saved. Avantiqo is completing provider-side setup; no customer action is required."
      : "Avantiqo is completing the provider setup. This connection will become available automatically when ready.",
    action: null,
    actionLabel: null,
    platformReady: false,
    customerSetup: registry.customerSetup || null,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    );
    if (!organizationId) {
      return NextResponse.json({ success: false, error: "organizationId required" }, { status: 400 });
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error || "Organization access denied" }, { status: access.status || 403 });
    }

    const [{ data: connections, error: connectionsError }, { data: assets, error: assetsError }] = await Promise.all([
      supabaseAdmin
        .from("organization_channel_connections")
        .select("id,organization_id,provider,channel_type,status,credentials_reference,metadata,authorized_at,updated_at")
        .eq("organization_id", access.organizationId),
      supabaseAdmin
        .from("organization_channel_assets")
        .select("id,organization_id,channel_provider,asset_type,external_id,name,entity_id,metadata,updated_at")
        .eq("organization_id", access.organizationId),
    ]);
    if (connectionsError) throw connectionsError;
    if (assetsError) throw assetsError;

    const credentialIds = Array.from(
      new Set(
        (connections || [])
          .map((row) => clean(row.credentials_reference))
          .filter(Boolean),
      ),
    );

    let credentialRows = [];
    if (credentialIds.length) {
      const { data, error } = await supabaseAdmin
        .from("provider_credentials")
        .select("id,provider_id,credential_type,status,metadata,created_at,updated_at")
        .in("id", credentialIds);
      if (error) throw error;
      credentialRows = data || [];
    }
    const credentials = new Map(credentialRows.map((row) => [row.id, row]));

    const rows = listCustomerIntegrations().map((integration) => {
      const status = statusForIntegration(
        integration,
        connections || [],
        assets || [],
        credentials,
      );
      return {
        id: integration.id,
        name: integration.name,
        category: integration.category,
        description: integration.description,
        connectPath: integration.connectPath,
        detailAnchor: integration.detailAnchor,
        availability: integration.availability,
        ...applyPlatformReadiness(integration, status),
      };
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      platformOperator: PLATFORM_ROLES.has(upper(access.role)),
      rows,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Integration catalog lookup failed" }, { status: 500 });
  }
}
