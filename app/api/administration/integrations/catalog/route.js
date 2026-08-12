export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { listCustomerIntegrations } from "@/lib/platform/channels/CustomerIntegrationCatalog";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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

function buildMetaStatus(integration, connections, assets, credentials) {
  const metaConnections = connections.filter((row) => row.provider === "meta" && isActive(row));
  const socialConnection =
    metaConnections.find((row) => upper(row.channel_type) === "SOCIAL") ||
    metaConnections.find((row) => upper(row.channel_type) !== "ADVERTISING") ||
    null;

  const facebookPage = assets.find(
    (row) => row.channel_provider === "meta" && row.asset_type === "facebook_page",
  ) || null;
  const instagramBusiness = assets.find(
    (row) => row.channel_provider === "meta" && row.asset_type === "instagram_business",
  ) || null;

  const socialCredential = socialConnection?.credentials_reference
    ? credentials.get(socialConnection.credentials_reference) || null
    : null;
  const credentialMetadata =
    socialCredential?.metadata && typeof socialCredential.metadata === "object"
      ? socialCredential.metadata
      : {};

  const messagingCredentialReady =
    upper(socialCredential?.status) === "ACTIVE" &&
    socialCredential?.credential_type === "oauth_page_token" &&
    upper(credentialMetadata.purpose) === "ORGANIZATION_CHANNEL_PUBLISHING" &&
    credentialMetadata.messaging_webhook_subscribed === true &&
    credentialMetadata.messaging_app_webhooks_configured === true;

  const facebookReady = Boolean(socialConnection && facebookPage);
  const instagramReady = Boolean(socialConnection && instagramBusiness);
  const managedAdAccountId =
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
      ? readyCapability("facebook-messenger", "Facebook Messenger", "Messenger webhook and reply credential are ready.")
      : setupCapability("facebook-messenger", "Facebook Messenger", "Reconnect Meta once to enable messaging permissions and webhooks."),
    instagramReady
      ? readyCapability("instagram-publishing", "Instagram Posts / Reels", instagramBusiness.name || null)
      : unavailableCapability("instagram-publishing", "Instagram Posts / Reels", "No Instagram professional account is linked."),
    messagingCredentialReady && instagramReady
      ? readyCapability("instagram-messaging", "Instagram Messaging", "Instagram professional-account messaging is ready.")
      : instagramReady
        ? setupCapability("instagram-messaging", "Instagram Messaging", "Reconnect Meta once to enable Instagram messaging permissions and webhooks.")
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
      ? "Facebook and Instagram are connected, but messaging needs the current Meta permissions and webhook setup."
      : "Meta publishing, messaging and advertising capabilities are ready where configured.",
    account: safeAccountLabel(socialConnection) || facebookPage?.name || instagramBusiness?.name || null,
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

    const rows = listCustomerIntegrations().map((integration) => ({
      id: integration.id,
      name: integration.name,
      category: integration.category,
      description: integration.description,
      connectPath: integration.connectPath,
      detailAnchor: integration.detailAnchor,
      availability: integration.availability,
      ...statusForIntegration(integration, connections || [], assets || [], credentials),
    }));

    return NextResponse.json({ success: true, organizationId: access.organizationId, rows });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Integration catalog lookup failed" }, { status: 500 });
  }
}
