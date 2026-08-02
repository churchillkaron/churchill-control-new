import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function bool(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
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
    throw new Error(
      payload?.error?.error_user_msg ||
      payload?.error?.message ||
      `Meta validation failed (${response.status})`,
    );
  }

  return payload;
}

async function main() {
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const organizationId = required("ORGANIZATION_ID");
  const accessToken = required("AVANTIQO_META_ACCESS_TOKEN");
  const rawAdAccountId = required("AVANTIQO_META_AD_ACCOUNT_ID");
  const adAccountId = rawAdAccountId.startsWith("act_")
    ? rawAdAccountId
    : `act_${rawAdAccountId}`;
  const apply = bool(process.env.APPLY);

  const account = await metaJson(adAccountId, accessToken, {
    fields: "id,name,account_id,account_status,currency,timezone_name,business",
  });

  if (!account?.id || !account?.currency) {
    throw new Error("Meta ad account validation did not return id and currency");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const [{ data: organization, error: organizationError }, { data: wallet, error: walletError }] =
    await Promise.all([
      supabase.from("organizations").select("id,name").eq("id", organizationId).single(),
      supabase.from("platform_wallets").select("*").eq("organization_id", organizationId).maybeSingle(),
    ]);

  if (organizationError) throw new Error(`Organization lookup failed: ${organizationError.message}`);
  if (walletError) throw new Error(`Wallet lookup failed: ${walletError.message}`);
  if (!wallet) throw new Error("Organization prepaid wallet does not exist");

  const walletCurrency = text(wallet.currency).toUpperCase();
  const providerCurrency = text(account.currency).toUpperCase();
  if (!walletCurrency || walletCurrency !== providerCurrency) {
    throw new Error(
      `Wallet currency ${walletCurrency || "missing"} does not match Meta account currency ${providerCurrency}`,
    );
  }

  const summary = {
    apply,
    organization_id: organization.id,
    organization_name: organization.name,
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

  const now = new Date().toISOString();
  const { data: existingCredentials, error: credentialReadError } = await supabase
    .from("provider_credentials")
    .select("*")
    .eq("provider_id", "meta")
    .eq("status", "ACTIVE");

  if (credentialReadError) {
    throw new Error(`Provider credential lookup failed: ${credentialReadError.message}`);
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

  let credential;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("provider_credentials")
      .update(credentialPayload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(`Provider credential update failed: ${error.message}`);
    credential = data;
  } else {
    const { data, error } = await supabase
      .from("provider_credentials")
      .insert({ ...credentialPayload, created_at: now })
      .select("*")
      .single();
    if (error) throw new Error(`Provider credential insert failed: ${error.message}`);
    credential = data;
  }

  const { data: existingService, error: serviceReadError } = await supabase
    .from("organization_services")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("service_id", "meta-ads")
    .maybeSingle();

  if (serviceReadError) {
    throw new Error(`Organization service lookup failed: ${serviceReadError.message}`);
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

  const { data: service, error: serviceWriteError } = await supabase
    .from("organization_services")
    .upsert(servicePayload, { onConflict: "organization_id,service_id" })
    .select("*")
    .single();

  if (serviceWriteError) {
    throw new Error(`Organization service activation failed: ${serviceWriteError.message}`);
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
  console.error(`MANAGED_META_ADS_BOOTSTRAP=FAIL: ${error.message}`);
  process.exit(1);
});
