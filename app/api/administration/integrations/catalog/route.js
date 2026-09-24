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

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeAccountLabel(connection) {
  const metadata = object(connection?.metadata);
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

function isCustomerUsableAsset(row) {
  const metadata = object(row?.metadata);
  return metadata.review_demo !== true && metadata.temporary !== true;
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
  const metaConnections = connections.filter(
    (row) => row.provider === "meta" && isActive(row),
  );
  const socialConnection =
    metaConnections.find((row) => upper(row.channel_type) === "SOCIAL") ||
    metaConnections.find((row) => upper(row.channel_type) !== "ADVERTISING") ||
    null;

  const { facebookPage, instagramBusiness } = assignedMetaAssets(assets);

  const socialCredential = socialConnection?.credentials_reference
    ? credentials.get(socialConnection.credentials_reference) || null
    : null;
  const credentialMetadata = object(socialCredential?.metadata);

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
    clean(
      metaConnections.find((row) => upper(row.channel_type) === "ADVERTISING")
        ?.metadata?.managed_ad_account_id,
    ) ||
    null;
  const adsReady = Boolean(managedAdAccountId);

  const capabilities = [
    facebookReady
      ? readyCapability("facebook-page", "Facebook Page", facebookPage.name || null)
      : setupCapability(
          "facebook-page",
          "Facebook Page",
          "Connect a business Facebook Page.",
        ),
    facebookReady
      ? readyCapability(
          "facebook-publishing",
          "Facebook Posts / Publishing",
          "Page publishing identity is available.",
        )
      : setupCapability(
          "facebook-publishing",
          "Facebook Posts / Publishing",
          "Facebook Page connection is required.",
        ),
    messagingCredentialReady && facebookReady
      ? readyCapability(
          "facebook-messenger",
          "Facebook Messenger",
          "Messenger webhook and reply credential are ready for this Page.",
        )
      : setupCapability(
          "facebook-messenger",
          "Facebook Messenger",
          "Reconnect Meta once to bind messaging to this organization's Facebook Page.",
        ),
    instagramReady
      ? readyCapability(
          "instagram-publishing",
          "Instagram Posts / Reels",
          instagramBusiness.name || null,
        )
      : unavailableCapability(
          "instagram-publishing",
          "Instagram Posts / Reels",
          "No Instagram professional account is linked.",
        ),
    messagingCredentialReady && instagramReady
      ? readyCapability(
          "instagram-messaging",
          "Instagram Messaging",
          "Instagram messaging is ready for this professional account.",
        )
      : instagramReady
        ? setupCapability(
            "instagram-messaging",
            "Instagram Messaging",
            "Reconnect Meta once to bind messaging to this organization's Instagram account.",
          )
        : unavailableCapability(
            "instagram-messaging",
            "Instagram Messaging",
            "No Instagram professional account is linked.",
          ),
    adsReady
      ? readyCapability("meta-ads", "Meta Ads", managedAdAccountId)
      : setupCapability(
          "meta-ads",
          "Meta Ads",
          "Assign or connect the managed Meta ad account.",
        ),
  ];

  const hasBaseConnection = Boolean(
    socialConnection || facebookPage || instagramBusiness || adsReady,
  );
  const needsMessagingSetup = capabilities.some(
    (capability) =>
      (capability.id === "facebook-messenger" ||
        capability.id === "instagram-messaging") &&
      capability.status === "SETUP_REQUIRED",
  );

  if (!hasBaseConnection) {
    return {
      state: "ACTION_REQUIRED",
      label: "Not connected",
      detail:
        "Connect the Meta business identity used for Facebook, Instagram, messaging and advertising.",
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
    account:
      facebookPage?.name ||
      instagramBusiness?.name ||
      safeAccountLabel(socialConnection) ||
      null,
    action: needsMessagingSetup && integration.connectPath ? "CONNECT" : null,
    actionLabel: needsMessagingSetup ? "Reconnect Meta" : null,
    capabilities,
  };
}

function buildEmailStatus(integration, connections) {
  const active = connections.filter(
    (row) =>
      integration.connectionProviders.includes(row.provider) &&
      isActive(row),
  );

  if (!active.length) {
    return {
      state: "ACTION_REQUIRED",
      label: "Not connected",
      detail: "Choose a mailbox provider and sign in. Avantiqo handles synchronization automatically.",
      account: null,
      action: integration.connectPath ? "CONNECT" : null,
      actionLabel: "Connect Email",
      capabilities: [
        setupCapability("email-send", "Sending", "Connect a mailbox first."),
        setupCapability("email-incoming", "Incoming sync", "Connect a mailbox first."),
        unavailableCapability("email-push", "Near-real-time incoming mail", "Available for supported OAuth mailboxes."),
      ],
    };
  }

  const primary = active[0];
  const metadata = object(primary.metadata);
  const sync = object(metadata.email_sync);
  const push = object(metadata.email_push);
  const syncReady = upper(sync.status) === "READY" && Boolean(clean(sync.last_success_at));
  const syncError = upper(sync.status) === "ERROR";
  const pushProvider = primary.provider === "email_google" || primary.provider === "email_microsoft";
  const pushExpiration = Date.parse(push.expiration || "");
  const pushReady =
    pushProvider &&
    upper(push.status) === "ACTIVE" &&
    Number.isFinite(pushExpiration) &&
    pushExpiration > Date.now();

  const capabilities = [
    readyCapability(
      "email-send",
      "Sending",
      "Outbound email is connected through this mailbox.",
    ),
    syncReady
      ? readyCapability(
          "email-incoming",
          "Incoming sync",
          sync.last_success_at
            ? `Last synchronized ${new Date(sync.last_success_at).toISOString()}.`
            : "Incoming mail synchronization is ready.",
        )
      : setupCapability(
          "email-incoming",
          "Incoming sync",
          syncError
            ? "Avantiqo is retrying incoming mailbox synchronization automatically."
            : "Avantiqo is initializing incoming mailbox synchronization.",
        ),
    primary.provider === "email_imap"
      ? readyCapability(
          "email-push",
          "Incoming polling",
          "IMAP mailboxes are checked automatically on the recovery schedule.",
        )
      : pushReady
        ? readyCapability(
            "email-push",
            "Near-real-time incoming mail",
            `Provider notifications are active until ${new Date(pushExpiration).toISOString()}.`,
          )
        : setupCapability(
            "email-push",
            "Near-real-time incoming mail",
            upper(push.status) === "ERROR"
              ? "Avantiqo is repairing the provider notification subscription automatically."
              : "Avantiqo is completing provider notification setup automatically.",
          ),
  ];

  const needsSetup = !syncReady || (pushProvider && !pushReady);
  const account =
    active.length > 1
      ? `${active.length} connected mailboxes`
      : safeAccountLabel(primary);

  return {
    state: needsSetup ? "SETUP_IN_PROGRESS" : "CONNECTED",
    label: needsSetup ? "Connected — finishing setup" : "Connected",
    detail: needsSetup
      ? "The mailbox connection is saved. Avantiqo is completing or repairing incoming-mail automation; no reconnect is required."
      : primary.provider === "email_imap"
        ? "Sending and automatic incoming-mail polling are ready."
        : "Sending, incoming synchronization and near-real-time provider notifications are ready.",
    account,
    action: null,
    actionLabel: null,
    capabilities,
  };
}

function statusForIntegration(integration, connections, assets, credentials) {
  if (integration.id === "meta") {
    return buildMetaStatus(integration, connections, assets, credentials);
  }

  if (integration.id === "email") {
    return buildEmailStatus(integration, connections);
  }

  const matchingConnections = connections.filter((row) =>
    integration.connectionProviders.includes(row.provider),
  );
  const activeConnection =
    matchingConnections.find((row) => upper(row.status) === "ACTIVE") || null;

  const matchingAssets = assets.filter((row) => {
    if (!isCustomerUsableAsset(row)) return false;
    if (
      integration.assetProviders?.length &&
      !integration.assetProviders.includes(row.channel_provider)
    ) {
      return false;
    }
    if (
      integration.assetTypes?.length &&
      !integration.assetTypes.includes(row.asset_type)
    ) {
      return false;
    }
    return true;
  });

  if (integration.id === "sms" && activeConnection) {
    const sender = matchingAssets.find((asset) => asset.asset_type === "sms_sender") || null;
    const webhookReady = activeConnection?.metadata?.webhook_ready === true;
    return {
      state: sender && webhookReady ? "CONNECTED" : "SETUP_IN_PROGRESS",
      label: sender && webhookReady ? "Connected" : "Finish setup",
      detail: sender && webhookReady
        ? "Twilio SMS sending, inbound Unified Inbox delivery, and delivery-status callbacks are ready."
        : "The Twilio SMS connection exists but sender or webhook setup is incomplete.",
      account: clean(sender?.metadata?.from_number)
        || clean(sender?.name)
        || clean(sender?.metadata?.messaging_service_sid)
        || safeAccountLabel(activeConnection),
      action: sender && webhookReady ? null : (integration.connectPath ? "CONNECT" : null),
      actionLabel: sender && webhookReady ? null : "Finish SMS setup",
      capabilities: [
        sender ? readyCapability("sms-sender", "SMS sender", clean(sender?.name) || null) : setupCapability("sms-sender", "SMS sender", "Choose an organization Twilio number or Messaging Service."),
        webhookReady ? readyCapability("sms-inbound", "Inbound SMS", "Incoming texts flow into Unified Inbox.") : setupCapability("sms-inbound", "Inbound SMS", "Finish Twilio inbound webhook configuration."),
        webhookReady ? readyCapability("sms-delivery", "Delivery tracking", "Twilio delivery callbacks are connected.") : setupCapability("sms-delivery", "Delivery tracking", "Finish Twilio delivery callback configuration."),
      ],
    };
  }

  if (integration.id === "pinterest" && activeConnection) {
    const account = matchingAssets.find((asset) => asset.asset_type === "pinterest_account") || null;
    const boardCount = Number(activeConnection?.metadata?.board_count || account?.metadata?.board_count || 0);
    if (!account) {
      return {
        state: "SETUP_IN_PROGRESS",
        label: "Finish setup",
        detail: "Pinterest authorization exists, but the organization Pinterest account identity is not bound yet.",
        account: safeAccountLabel(activeConnection),
        action: integration.connectPath ? "CONNECT" : null,
        actionLabel: "Reconnect Pinterest",
        capabilities: [
          setupCapability("pinterest-account", "Pinterest account", "Reconnect and authorize the business Pinterest account."),
        ],
      };
    }
    return {
      state: "CONNECTED",
      label: "Connected",
      detail: boardCount > 0
        ? `Pinterest account connected with ${boardCount} available board${boardCount === 1 ? "" : "s"}.`
        : "Pinterest account connected. Create at least one Pinterest board before publishing Pins.",
      account: clean(account.name) || safeAccountLabel(activeConnection),
      action: null,
      capabilities: [
        readyCapability("pinterest-account", "Pinterest account", clean(account.name) || null),
        boardCount > 0
          ? readyCapability("pinterest-boards", "Board discovery", `${boardCount} board${boardCount === 1 ? "" : "s"} available.`)
          : setupCapability("pinterest-boards", "Board discovery", "No Pinterest boards are available yet."),
        boardCount > 0
          ? readyCapability("pinterest-publishing", "Organic Pin publishing", "Image Pin publishing is ready for authorized boards.")
          : setupCapability("pinterest-publishing", "Organic Pin publishing", "Create a Pinterest board before publishing."),
        unavailableCapability("pinterest-ads", "Pinterest Ads", "Organic Pinterest is connected; paid Pinterest Ads is not enabled by this connection."),
      ],
    };
  }

  if (integration.id === "youtube" && activeConnection) {
    const channel = matchingAssets.find((asset) => asset.asset_type === "youtube_channel") || null;
    const auditApproved = activeConnection?.metadata?.upload_audit_approved === true
      || String(process.env.YOUTUBE_UPLOAD_AUDIT_APPROVED || "").trim().toLowerCase() === "true";
    if (!channel) {
      return {
        state: "SETUP_IN_PROGRESS",
        label: "Finish setup",
        detail: "Google authorization exists, but the organization YouTube channel identity is not bound yet.",
        account: safeAccountLabel(activeConnection),
        action: integration.connectPath ? "CONNECT" : null,
        actionLabel: "Reconnect YouTube",
        capabilities: [
          setupCapability("youtube-channel", "YouTube channel", "Reconnect and authorize the business YouTube channel."),
        ],
      };
    }
    return {
      state: "CONNECTED",
      label: auditApproved ? "Connected" : "Connected — upload restriction",
      detail: auditApproved
        ? "YouTube channel authorization, video publishing and channel analytics are ready."
        : "The YouTube channel is connected. Private uploads and analytics are ready; public upload behavior remains subject to Google OAuth/API verification and YouTube upload audit status.",
      account: clean(channel.name) || safeAccountLabel(activeConnection),
      action: null,
      capabilities: [
        readyCapability("youtube-channel", "YouTube channel", clean(channel.name) || null),
        readyCapability("youtube-analytics", "Channel analytics", "Authorized channel statistics are available."),
        readyCapability("youtube-private-upload", "Private video uploads", "Avantiqo defaults uploads to private unless another privacy status is explicitly requested."),
        auditApproved
          ? readyCapability("youtube-public-upload", "Public video publishing", "Avantiqo YouTube upload audit is marked approved.")
          : setupCapability("youtube-public-upload", "Public video publishing", "Google/YouTube project verification or upload audit may still restrict public publishing."),
      ],
    };
  }

  if (integration.id === "telegram" && activeConnection) {
    const webhookReady = activeConnection?.metadata?.webhook_ready === true;
    const botAsset = matchingAssets.find((asset) => asset.asset_type === "telegram_bot") || null;
    return {
      state: webhookReady && botAsset ? "CONNECTED" : "SETUP_IN_PROGRESS",
      label: webhookReady && botAsset ? "Connected" : "Finish setup",
      detail: webhookReady && botAsset
        ? "Telegram bot messaging and inbound webhook delivery are ready."
        : "The Telegram bot connection exists but webhook setup is not complete.",
      account: clean(botAsset?.metadata?.username)
        ? `@${clean(botAsset.metadata.username)}`
        : clean(botAsset?.name) || safeAccountLabel(activeConnection),
      action: webhookReady && botAsset ? null : (integration.connectPath ? "CONNECT" : null),
      actionLabel: webhookReady && botAsset ? null : "Finish Telegram setup",
    };
  }

  if (integration.id === "google-business" && activeConnection) {
    const discovery = upper(activeConnection.metadata?.location_discovery_status);
    const assignedLocations = matchingAssets.filter((asset) => Boolean(asset.entity_id));
    const unassignedLocations = matchingAssets.filter((asset) =>
      !asset.entity_id && upper(asset?.metadata?.assignment_status) !== "IGNORED"
    );
    if (discovery && discovery !== "READY") {
      return {
        state: "SETUP_IN_PROGRESS",
        label: "Connected",
        detail:
          "Avantiqo is completing the remaining Google setup. No reconnect is required.",
        account: safeAccountLabel(activeConnection),
        action: integration.detailAnchor ? "MANAGE" : null,
      };
    }
    if (!assignedLocations.length && matchingAssets.length) {
      return {
        state: "SETUP_IN_PROGRESS",
        label: "Choose location",
        detail: `${matchingAssets.length} Google Business location${matchingAssets.length === 1 ? " is" : "s are"} available. Assign the location or locations that belong to this organization.`,
        account: safeAccountLabel(activeConnection),
        action: integration.detailAnchor ? "MANAGE" : null,
      };
    }
    if (assignedLocations.length && unassignedLocations.length) {
      return {
        state: "SETUP_IN_PROGRESS",
        label: "Review locations",
        detail: `${assignedLocations.length} location${assignedLocations.length === 1 ? " is" : "s are"} assigned and ${unassignedLocations.length} provider location${unassignedLocations.length === 1 ? " is" : "s are"} still unassigned. Review ownership before setup is considered complete.`,
        account: assignedLocations.length === 1 ? clean(assignedLocations[0]?.name) : `${assignedLocations.length} assigned locations`,
        action: integration.detailAnchor ? "MANAGE" : null,
      };
    }
    if (assignedLocations.length) {
      return {
        state: "CONNECTED",
        label: "Connected",
        detail: `${assignedLocations.length} Google Business location${assignedLocations.length === 1 ? " is" : "s are"} assigned to this organization.`,
        account: assignedLocations.length === 1 ? clean(assignedLocations[0]?.name) : `${assignedLocations.length} assigned locations`,
        action: integration.detailAnchor ? "MANAGE" : null,
      };
    }
  }

  if (integration.id === "google-ads") {
    const advertisers = matchingAssets.filter(
      (asset) => asset?.metadata?.manager !== true,
    );
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
        detail:
          "Google Ads authorization is active. Select the advertiser account to finish setup.",
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

  const alreadyConnected =
    status.state === "CONNECTED" || status.state === "SETUP_IN_PROGRESS";
  return {
    ...status,
    state: "PLATFORM_SETUP",
    label: alreadyConnected ? "Avantiqo setup in progress" : "Available soon",
    detail: alreadyConnected
      ? (registry?.platformSetup?.approval || "The business connection is saved. Avantiqo is completing provider-side setup; no customer action is required.")
      : (registry?.platformSetup?.approval || registry?.platformSetup?.summary || "Avantiqo is completing the provider setup. This connection will become available automatically when ready."),
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
      url.searchParams.get("organizationId") ||
        url.searchParams.get("organization_id"),
    );
    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error || "Organization access denied",
        },
        { status: access.status || 403 },
      );
    }

    const [
      { data: connections, error: connectionsError },
      { data: assets, error: assetsError },
    ] = await Promise.all([
      supabaseAdmin
        .from("organization_channel_connections")
        .select(
          "id,organization_id,provider,channel_type,status,credentials_reference,metadata,authorized_at,updated_at",
        )
        .eq("organization_id", access.organizationId),
      supabaseAdmin
        .from("organization_channel_assets")
        .select(
          "id,organization_id,channel_provider,asset_type,external_id,name,entity_id,metadata,updated_at",
        )
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
        .select(
          "id,provider_id,credential_type,status,metadata,created_at,updated_at",
        )
        .in("id", credentialIds);
      if (error) throw error;
      credentialRows = data || [];
    }

    const credentials = new Map(
      credentialRows.map((row) => [row.id, row]),
    );

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
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Integration catalog lookup failed",
      },
      { status: 500 },
    );
  }
}
