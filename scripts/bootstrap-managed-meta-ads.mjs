import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

let currentStage = "START";

function stage(value) {
  currentStage = value;
  console.log(`BOOTSTRAP_STAGE=${value}`);
}

function text(value) {
  return String(value ?? "").trim();
}

function looksLikePlaceholder(value) {
  const normalized = text(value).toUpperCase();
  return (
    normalized.startsWith("YOUR_") ||
    normalized.includes("YOUR_REAL_") ||
    normalized.startsWith("REPLACE_") ||
    normalized === "NULL" ||
    normalized === "UNDEFINED"
  );
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} is required`);
  if (looksLikePlaceholder(value)) {
    throw new Error(`${name} still contains a placeholder instead of a real value`);
  }
  return value;
}

function bool(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function safePart(value) {
  const normalized = text(value).replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 400) : null;
}

function supabaseError(label, error) {
  const parts = [
    safePart(error?.message),
    error?.code ? `code=${error.code}` : null,
    error?.details ? `details=${safePart(error.details)}` : null,
    error?.hint ? `hint=${safePart(error.hint)}` : null,
  ].filter(Boolean);

  return new Error(`${label}: ${parts.join(" | ") || "Unknown Supabase error"}`);
}

async function metaJson(path, accessToken, params = {}) {
  const version = required("META_GRAPH_API_VERSION");
  const url = new URL(`https://graph.facebook.com/${version}/${path.replace(/^\//, "")}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.error) {
    const metaError = payload?.error || {};
    const parts = [
      safePart(metaError.error_user_msg || metaError.message),
      `status=${response.status}`,
      metaError.code !== undefined ? `code=${metaError.code}` : null,
      metaError.error_subcode !== undefined
        ? `subcode=${metaError.error_subcode}`
        : null,
      metaError.type ? `type=${metaError.type}` : null,
      metaError.fbtrace_id ? `trace=${metaError.fbtrace_id}` : null,
    ].filter(Boolean);

    throw new Error(`Meta request ${path} failed: ${parts.join(" | ")}`);
  }

  return payload;
}

async function main() {
  stage("LOAD_CONFIGURATION");

  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const organizationId = required("ORGANIZATION_ID");
  const accessToken = required("AVANTIQO_META_ACCESS_TOKEN");
  const rawAdAccountId = required("AVANTIQO_META_AD_ACCOUNT_ID");
  const adAccountId = rawAdAccountId.startsWith("act_")
    ? rawAdAccountId
    : `act_${rawAdAccountId}`;
  const apply = bool(process.env.APPLY);

  stage("VALIDATE_META_AD_ACCOUNT");

  const account = await metaJson(adAccountId, accessToken, {
    fields: "id,name,account_id,account_status,currency,timezone_name",
  });

  if (!account?.id || !account?.currency) {
    throw new Error(
      `Meta ad account validation returned incomplete data: id=${Boolean(account?.id)} currency=${Boolean(account?.currency)}`,
    );
  }

  stage("CONNECT_SUPABASE");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  stage("READ_ORGANIZATION_AND_WALLET");

  const [organizationResult, walletResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .maybeSingle(),
    supabase
      .from("platform_wallets")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (organizationResult.error) {
    throw supabaseError("Organization lookup failed", organizationResult.error);
  }
  if (walletResult.error) {
    throw supabaseError("Wallet lookup failed", walletResult.error);
  }

  const organization = organizationResult.data;
  const wallet = walletResult.data;

  if (!organization) throw new Error(`Organization ${organizationId} was not found`);
  if (!wallet) throw new Error("Organization prepaid wallet does not exist");

  stage("VALIDATE_CURRENCY");

  const walletCurrency = text(wallet.currency).toUpperCase();
  const providerCurrency = text(account.currency).toUpperCase();

  if (!walletCurrency || walletCurrency !== providerCurrency) {
    throw new Error(
      `Wallet currency ${walletCurrency || "missing"} does not match Meta account currency ${providerCurrency || "missing"}`,
    );
  }

  const organizationName =
    organization.name ||
    organization.legal_name ||
    organization.display_name ||
    organization.organization_name ||
    null;

  const summary = {
    apply,
    organization_id: organization.id,
    organization_name: organizationName,
    wallet_currency: walletCurrency,
    wallet_status: wallet.status,
    meta_ad_account_id: account.id,
    meta_ad_account_name: account.name || null,
    meta_account_status: account.account_status,
    meta_currency: providerCurrency,
    whatsapp_ads_enabled: bool(process.env.AVANTIQO_META_WHATSAPP_ADS_ENABLED),
  };

  console.log("MANAGED_META_ADS_PREFLIGHT");
  console.log(JSON.stringify(summary, null, 2));

  if (!apply) {
    console.log("APPLY=NO");
    console.log("No database changes were made. Re-run with APPLY=true after reviewing the preflight.");
    return;
  }

  stage("READ_MANAGED_META_CREDENTIAL");

  const now = new Date().toISOString();
  const { data: existingCredentials, error: credentialReadError } = await supabase
    .from("provider_credentials")
    .select("*")
    .eq("provider_id", "meta")
    .eq("status", "ACTIVE");

  if (credentialReadError) {
    throw supabaseError("Provider credential lookup failed", credentialReadError);
  }

  const existing = (existingCredentials || []).find(
    (row) => text(row?.metadata?.purpose).toUpperCase() === "AVANTIQO_MANAGED_ADVERTISING",
  );

  const credentialPayload = {
    provider_id: "meta",
    credential_type: "managed_access_token",
    secret_reference: accessToken,
    status: "ACTIVE",
    metadata: {
      ...(existing?.metadata || {}),
      purpose: "AVANTIQO_MANAGED_ADVERTISING",
      managed_by: "AVANTIQO",
      ad_account_id: account.id,
      ad_account_name: account.name || null,
      currency: providerCurrency,
      priority: Number(process.env.AVANTIQO_META_CREDENTIAL_PRIORITY || 100),
      whatsapp_ads_enabled: bool(process.env.AVANTIQO_META_WHATSAPP_ADS_ENABLED),
      validated_at: now,
      enabled: true,
    },
    updated_at: now,
  };

  stage("STORE_MANAGED_META_CREDENTIAL");

  let credential;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("provider_credentials")
      .update(credentialPayload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw supabaseError("Provider credential update failed", error);
    credential = data;
  } else {
    const { data, error } = await supabase
      .from("provider_credentials")
      .insert({ ...credentialPayload, created_at: now })
      .select("*")
      .single();
    if (error) throw supabaseError("Provider credential insert failed", error);
    credential = data;
  }

  stage("READ_ORGANIZATION_SERVICE");

  const { data: existingService, error: serviceReadError } = await supabase
    .from("organization_services")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("service_id", "meta-ads")
    .maybeSingle();

  if (serviceReadError) {
    throw supabaseError("Organization service lookup failed", serviceReadError);
  }

  const servicePayload = {
    organization_id: organizationId,
    service_category_id: "marketing-social",
    service_id: "meta-ads",
    package_id: existingService?.package_id || "growth",
    status: "ACTIVE",
    managed_by: "avantiqo",
    authorization_required: true,
    usage_enabled: true,
    billing_enabled: true,
    health: "HEALTHY",
    activated_at: existingService?.activated_at || now,
    billing_mode: "PREPAID_MANAGED_MEDIA",
    pricing_mode: "PROVIDER",
    default_currency: providerCurrency,
    configuration: {
      ...(existingService?.configuration || {}),
      managed_provider: "meta",
      managed_credential_id: credential.id,
      managed_ad_account_id: account.id,
      managed_ad_account_currency: providerCurrency,
      whatsapp_ads_enabled: bool(process.env.AVANTIQO_META_WHATSAPP_ADS_ENABLED),
    },
    metadata: {
      ...(existingService?.metadata || {}),
      provider: "meta",
      connection_model: "MANAGED_PROVIDER_WITH_ORGANIZATION_CHANNEL",
      validated_at: now,
    },
    updated_at: now,
  };

  stage("ACTIVATE_ORGANIZATION_SERVICE");

  const { data: service, error: serviceWriteError } = await supabase
    .from("organization_services")
    .upsert(servicePayload, { onConflict: "organization_id,service_id" })
    .select("*")
    .single();

  if (serviceWriteError) {
    throw supabaseError("Organization service activation failed", serviceWriteError);
  }

  console.log("MANAGED_META_ADS_BOOTSTRAP=PASS");
  console.log(
    JSON.stringify(
      {
        organization_id: organizationId,
        provider_credential_id: credential.id,
        organization_service_id: service.id,
        ad_account_id: account.id,
        currency: providerCurrency,
        campaign_created: false,
        wallet_charged: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`MANAGED_META_ADS_BOOTSTRAP=FAIL`);
  console.error(`FAILED_STAGE=${currentStage}`);
  console.error(`ERROR=${error?.message || String(error)}`);
  process.exit(1);
});
