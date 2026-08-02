import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
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

function resolveSecret(reference) {
  const value = text(reference);
  if (!value) return { token: null, storage: "MISSING" };

  if (value.toLowerCase().startsWith("env:")) {
    const name = value.slice(4).trim();
    return {
      token: name ? text(process.env[name]) || null : null,
      storage: name ? `ENV:${name}` : "INVALID_ENV_REFERENCE",
    };
  }

  return {
    token: value,
    storage: "DATABASE_SECRET_REFERENCE",
  };
}

function safeError(payload, response) {
  const error = object(payload?.error);
  return {
    status: response.status,
    code: error.code ?? null,
    subcode: error.error_subcode ?? null,
    type: error.type ?? null,
    message: text(error.error_user_msg || error.message || `HTTP ${response.status}`),
  };
}

async function graphGet(path, token, params = {}) {
  const url = new URL(`https://graph.facebook.com/${String(path).replace(/^\//, "")}`);
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
  const effectiveVersion =
    response.headers.get("facebook-api-version") ||
    response.headers.get("x-fb-api-version") ||
    null;

  if (!response.ok || payload?.error) {
    return {
      ok: false,
      effective_version: effectiveVersion,
      error: safeError(payload, response),
      payload: null,
    };
  }

  return {
    ok: true,
    effective_version: effectiveVersion,
    error: null,
    payload,
  };
}

async function inspectCredential(row) {
  const metadata = object(row.metadata);
  const secret = resolveSecret(row.secret_reference);
  const base = {
    credential_id: row.id,
    credential_type: row.credential_type || null,
    status: row.status || null,
    purpose: metadata.purpose || null,
    organization_id: metadata.organization_id || null,
    page_id: metadata.page_id || null,
    configured_ad_account_id: metadata.ad_account_id || null,
    secret_storage: secret.storage,
    secret_available: Boolean(secret.token),
  };

  if (!secret.token) {
    return {
      ...base,
      token_valid: false,
      advertising_access: false,
      effective_graph_api_version: null,
      ad_accounts: [],
      validation_error: "Secret is not available in this environment",
    };
  }

  const identity = await graphGet("me", secret.token, {
    fields: "id,name",
  });

  if (!identity.ok) {
    return {
      ...base,
      token_valid: false,
      advertising_access: false,
      effective_graph_api_version: identity.effective_version,
      ad_accounts: [],
      validation_error: identity.error,
    };
  }

  const adAccounts = await graphGet("me/adaccounts", secret.token, {
    fields: "id,name,account_id,account_status,currency,timezone_name,business",
    limit: "100",
  });

  const rows = adAccounts.ok && Array.isArray(adAccounts.payload?.data)
    ? adAccounts.payload.data
    : [];

  return {
    ...base,
    token_valid: true,
    identity: {
      id: identity.payload?.id || null,
      name: identity.payload?.name || null,
    },
    advertising_access: rows.length > 0,
    effective_graph_api_version:
      adAccounts.effective_version || identity.effective_version || null,
    ad_accounts: rows.map((account) => ({
      id: account.id || null,
      account_id: account.account_id || null,
      name: account.name || null,
      account_status: account.account_status ?? null,
      currency: account.currency || null,
      timezone_name: account.timezone_name || null,
      business_id: account.business?.id || null,
      business_name: account.business?.name || null,
    })),
    validation_error: adAccounts.ok ? null : adAccounts.error,
  };
}

async function main() {
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await supabase
    .from("provider_credentials")
    .select("*")
    .eq("provider_id", "meta")
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Meta credential lookup failed: ${error.message}`);
  }

  const credentials = data || [];
  const inspections = [];

  for (const credential of credentials) {
    inspections.push(await inspectCredential(credential));
  }

  const advertisingCredentials = inspections.filter(
    (credential) => credential.advertising_access,
  );
  const adAccounts = advertisingCredentials.flatMap((credential) =>
    credential.ad_accounts.map((account) => ({
      credential_id: credential.credential_id,
      effective_graph_api_version: credential.effective_graph_api_version,
      ...account,
    })),
  );

  console.log("EXISTING_META_CREDENTIAL_INSPECTION");
  console.log(JSON.stringify({
    active_meta_credential_count: credentials.length,
    advertising_credential_count: advertisingCredentials.length,
    discovered_ad_account_count: adAccounts.length,
    credentials: inspections,
    discovered_ad_accounts: adAccounts,
    secrets_printed: false,
    database_changed: false,
  }, null, 2));

  if (!credentials.length) {
    console.log("RESULT=NO_ACTIVE_META_CREDENTIALS");
    process.exitCode = 2;
    return;
  }

  if (!advertisingCredentials.length) {
    console.log("RESULT=EXISTING_META_TOKEN_HAS_NO_ADVERTISING_ACCESS");
    process.exitCode = 3;
    return;
  }

  if (!adAccounts.length) {
    console.log("RESULT=NO_ACCESSIBLE_META_AD_ACCOUNTS");
    process.exitCode = 4;
    return;
  }

  console.log("RESULT=EXISTING_MANAGED_META_TOKEN_READY");
}

main().catch((error) => {
  console.error("EXISTING_META_CREDENTIAL_INSPECTION=FAIL");
  console.error(`ERROR=${error?.message || String(error)}`);
  process.exit(1);
});
