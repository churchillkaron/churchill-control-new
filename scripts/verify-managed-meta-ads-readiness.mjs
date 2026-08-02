import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} is required`);
  return value;
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

function isEligibleImage(asset = {}) {
  if (asset.archived) return false;

  const mime = text(
    asset.mime_type || asset.metadata?.mime_type || asset.analysis?.mime_type,
  ).toLowerCase();
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const url = text(sourceUrl(asset)).toLowerCase();

  if (!url.startsWith("https://")) return false;
  if (mime.startsWith("video/") || type.includes("video")) return false;
  if (/\.(mp4|mov|m4v|webm)(\?|$)/.test(url)) return false;

  return Boolean(
    asset.image_url ||
      mime.startsWith("image/") ||
      type.includes("image") ||
      type.includes("poster") ||
      type.includes("campaign") ||
      /\.(png|jpe?g|webp)(\?|$)/.test(url),
  );
}

function approvalStatus(asset = {}) {
  const metadata = object(asset.metadata);
  const review = object(asset.review || metadata.review);
  return Boolean(
    metadata.owner_approved === true ||
      metadata.brand_approved === true ||
      metadata.approved === true ||
      review.approved === true ||
      review.human_reviewed === true,
  )
    ? "APPROVED"
    : "EXPLICIT_CONFIRMATION_REQUIRED";
}

function safeError(error) {
  return [
    text(error?.message),
    error?.code ? `code=${error.code}` : null,
    error?.hint ? `hint=${text(error.hint)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function graphGet(path, token, params = {}) {
  const version = required("META_GRAPH_API_VERSION");
  const url = new URL(
    `https://graph.facebook.com/${version}/${String(path).replace(/^\//, "")}`,
  );

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.error) {
    const error = payload?.error || {};
    throw new Error(
      [
        error.error_user_msg || error.message || `HTTP ${response.status}`,
        error.code !== undefined ? `code=${error.code}` : null,
        error.error_subcode !== undefined
          ? `subcode=${error.error_subcode}`
          : null,
        error.type ? `type=${error.type}` : null,
      ]
        .filter(Boolean)
        .join(" | "),
    );
  }

  return payload;
}

async function checked(label, promise) {
  const result = await promise;
  if (result.error) {
    throw new Error(`${label}: ${safeError(result.error)}`);
  }
  return result;
}

async function main() {
  const organizationId = required("ORGANIZATION_ID");
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const token = required("AVANTIQO_META_ACCESS_TOKEN");
  const configuredAdAccountId = required("AVANTIQO_META_AD_ACCOUNT_ID");

  console.log("MANAGED_META_ADS_READINESS_CHECK");
  console.log("MODE=READ_ONLY");
  console.log("DATABASE_CHANGES=NO");
  console.log("CAMPAIGN_CREATED=NO");
  console.log("WALLET_CHANGED=NO");
  console.log("TOKEN_PRINTED=NO");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const [
    organizationResult,
    walletResult,
    serviceResult,
    channelResult,
    credentialsResult,
    assetsResult,
    campaignsResult,
  ] = await Promise.all([
    checked(
      "Organization lookup failed",
      supabase
        .from("organizations")
        .select("*")
        .eq("id", organizationId)
        .maybeSingle(),
    ),
    checked(
      "Wallet lookup failed",
      supabase
        .from("organization_wallets")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ),
    checked(
      "Organization service lookup failed",
      supabase
        .from("organization_services")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("service_id", "meta-ads")
        .maybeSingle(),
    ),
    checked(
      "Meta channel lookup failed",
      supabase
        .from("organization_channel_connections")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("provider", "meta")
        .maybeSingle(),
    ),
    checked(
      "Managed credential lookup failed",
      supabase
        .from("provider_credentials")
        .select("*")
        .eq("provider_id", "meta")
        .eq("status", "ACTIVE"),
    ),
    checked(
      "Creative asset lookup failed",
      supabase
        .from("creative_assets")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("archived", false)
        .order("created_at", { ascending: false })
        .limit(300),
    ),
    checked(
      "Managed campaign ledger lookup failed",
      supabase
        .from("managed_media_campaigns")
        .select("id,status,provider_campaign_id,created_at", { count: "exact" })
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(20),
    ),
  ]);

  const organization = organizationResult.data;
  const wallet = walletResult.data;
  const service = serviceResult.data;
  const channel = channelResult.data;
  const channelMetadata = object(channel?.metadata);
  const serviceConfiguration = {
    ...object(service?.metadata),
    ...object(service?.configuration),
  };

  const managedCredential = (credentialsResult.data || []).find(
    (row) =>
      upper(row?.metadata?.purpose) === "AVANTIQO_MANAGED_ADVERTISING",
  );
  const credentialMetadata = object(managedCredential?.metadata);

  const pageId =
    channelMetadata.page_id || channelMetadata.facebook_page_id || null;
  const connectedInstagramId =
    channelMetadata.instagram_business_id ||
    channelMetadata.instagram_actor_id ||
    null;

  const normalizedAdAccountId = configuredAdAccountId.startsWith("act_")
    ? configuredAdAccountId
    : `act_${configuredAdAccountId}`;

  const adAccount = await graphGet(normalizedAdAccountId, token, {
    fields: "id,name,account_id,account_status,currency,timezone_name,business",
  });

  let page = null;
  let pageError = null;
  if (pageId) {
    try {
      page = await graphGet(pageId, token, {
        fields: "id,name,instagram_business_account{id,username}",
      });
    } catch (error) {
      pageError = error?.message || String(error);
    }
  }

  const assets = (assetsResult.data || []).filter(isEligibleImage);
  const approvedAssets = assets.filter(
    (asset) => approvalStatus(asset) === "APPROVED",
  );
  const providerInstagramId = page?.instagram_business_account?.id || null;

  const blockers = [];
  const warnings = [];

  if (!organization) blockers.push("Organization was not found");
  if (upper(wallet?.status) !== "ACTIVE") {
    blockers.push("Organization prepaid wallet is not active");
  }
  if (!wallet?.currency) blockers.push("Organization wallet currency is missing");
  if (Number(wallet?.available_balance || 0) <= 0) {
    blockers.push("Organization wallet has no available balance");
  }
  if (upper(service?.status) !== "ACTIVE") {
    blockers.push("Managed Meta Advertising service is not active");
  }
  if (service?.usage_enabled === false || service?.billing_enabled === false) {
    blockers.push("Managed Meta Advertising usage or billing is disabled");
  }
  if (!managedCredential) blockers.push("Managed Meta credential record is missing");
  if (managedCredential?.secret_reference !== "env:AVANTIQO_META_ACCESS_TOKEN") {
    blockers.push("Managed Meta credential does not use the canonical environment secret reference");
  }
  if (
    credentialMetadata.ad_account_id &&
    credentialMetadata.ad_account_id !== adAccount.id
  ) {
    blockers.push("Managed credential ad account does not match the validated Meta ad account");
  }
  if (upper(channel?.status) !== "ACTIVE") {
    blockers.push("Organization Meta channel connection is not active");
  }
  if (!pageId) blockers.push("Organization Facebook Page id is missing");
  if (pageId && !page) {
    blockers.push(`Managed Meta token cannot access the connected Facebook Page: ${pageError || "unknown error"}`);
  }
  if (!assets.length) blockers.push("No eligible public HTTPS image creative asset is available");
  if (upper(wallet?.currency) !== upper(adAccount?.currency)) {
    blockers.push("Wallet currency does not match Meta ad account currency");
  }

  if (!approvedAssets.length && assets.length) {
    warnings.push("No image asset is already marked approved; explicit owner confirmation will be required in the campaign builder");
  }
  if (!connectedInstagramId) {
    warnings.push("Instagram id is missing from the organization channel connection");
  }
  if (
    providerInstagramId &&
    connectedInstagramId &&
    String(providerInstagramId) !== String(connectedInstagramId)
  ) {
    blockers.push("Connected Instagram id does not match the Instagram account attached to the Facebook Page");
  }
  if (!text(process.env.CRON_SECRET)) {
    warnings.push("CRON_SECRET is not configured locally; automated spend reconciliation is not ready in this environment");
  }
  if (serviceConfiguration.whatsapp_ads_enabled !== true) {
    warnings.push("WhatsApp Ads is disabled, which is expected until separately configured and tested");
  }

  const report = {
    ready_for_paused_campaign_creation: blockers.length === 0,
    blockers,
    warnings,
    organization: organization
      ? {
          id: organization.id,
          name:
            organization.name ||
            organization.legal_name ||
            organization.display_name ||
            organization.organization_name ||
            null,
        }
      : null,
    wallet: wallet
      ? {
          status: wallet.status,
          currency: wallet.currency,
          available_balance: Number(wallet.available_balance || 0),
          reserved_balance: Number(wallet.reserved_balance || 0),
        }
      : null,
    managed_service: service
      ? {
          id: service.id,
          status: service.status,
          usage_enabled: service.usage_enabled,
          billing_enabled: service.billing_enabled,
          health: service.health,
        }
      : null,
    managed_credential: managedCredential
      ? {
          id: managedCredential.id,
          status: managedCredential.status,
          secret_reference: managedCredential.secret_reference,
          ad_account_id: credentialMetadata.ad_account_id || null,
        }
      : null,
    meta_ad_account: {
      id: adAccount.id,
      name: adAccount.name || null,
      account_status: adAccount.account_status,
      currency: adAccount.currency,
      timezone_name: adAccount.timezone_name || null,
    },
    organization_channel: channel
      ? {
          status: channel.status,
          page_id: pageId,
          page_name: page?.name || null,
          instagram_business_id: connectedInstagramId,
          instagram_username: page?.instagram_business_account?.username || null,
          provider_instagram_business_id: providerInstagramId,
        }
      : null,
    creative_assets: {
      eligible_image_count: assets.length,
      approved_image_count: approvedAssets.length,
      candidates: assets.slice(0, 10).map((asset) => ({
        id: asset.id,
        name:
          asset.name ||
          asset.title ||
          asset.file_name ||
          "Untitled creative asset",
        asset_type: asset.asset_type || null,
        approval_status: approvalStatus(asset),
        favorite: Boolean(asset.favorite),
        created_at: asset.created_at || null,
      })),
    },
    campaign_ledger: {
      table_accessible: true,
      campaign_count: campaignsResult.count ?? (campaignsResult.data || []).length,
      recent: campaignsResult.data || [],
    },
    whatsapp_ads_enabled:
      serviceConfiguration.whatsapp_ads_enabled === true &&
      credentialMetadata.whatsapp_ads_enabled === true,
    cron_secret_configured: Boolean(text(process.env.CRON_SECRET)),
    campaign_created: false,
    wallet_changed: false,
    token_printed: false,
  };

  console.log("MANAGED_META_ADS_READINESS_REPORT");
  console.log(JSON.stringify(report, null, 2));

  if (blockers.length) {
    console.log("MANAGED_META_ADS_READINESS=BLOCKED");
    process.exitCode = 2;
    return;
  }

  console.log("MANAGED_META_ADS_READINESS=PASS");
}

main().catch((error) => {
  console.error("MANAGED_META_ADS_READINESS=FAIL");
  console.error(`ERROR=${error?.message || String(error)}`);
  process.exit(1);
});
