export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveProviderCredentialSecret } from "@/lib/platform/service-runtime/credentials/runtime/ProviderCredentialSecretBroker";
import { getBankFeedProvider } from "@/lib/finance/banking/providers/BankFeedProviderRegistry";
import { getEInvoiceProvider } from "@/lib/finance/e-invoicing/providers/EInvoiceProviderRegistry";

const ETAX_PROVIDERS = new Set(["certified_etax_rest", "netbay_invoicechain", "inet_etax"]);
const EMAIL_PROVIDERS = new Set(["email_google", "email_microsoft", "email_imap"]);
const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const upper = (value) => text(value).toUpperCase();
const now = () => new Date().toISOString();
const staffId = (access) => access?.access?.staffAccountId || access?.staff?.id || access?.staffId || access?.staff_id || null;
const parseSecret = (value) => { const raw = text(value, 20000); if (!raw) return {}; try { const parsed = JSON.parse(raw); return parsed && typeof parsed === "object" ? parsed : { api_key: raw }; } catch { return { api_key: raw }; } };

async function requireConfig(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) {
    return { response: NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 }) };
  }
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.configuration.manage",
    fullAccess: access.permissions?.includes("*") === true,
  });
  return { access };
}

async function provision({ organizationId, providerId, credentialType, secretPayload, metadata }) {
  const { data, error } = await supabaseAdmin.rpc("provision_finance_provider_credential", {
    p_organization_id: organizationId,
    p_provider_id: providerId,
    p_credential_type: credentialType,
    p_secret_payload: secretPayload,
    p_metadata: metadata,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.credential_id || upper(row.status) !== "ACTIVE") {
    throw new Error("FINANCE_PROVIDER_CREDENTIAL_PROVISION_RESULT_INVALID");
  }
  return row;
}

async function loadScopedCredential({ organizationId, providerId, credentialId = null, credentialType = null }) {
  let query = supabaseAdmin.from("provider_credentials").select("id,provider_id,credential_type,secret_reference,status,metadata,created_at,updated_at").eq("status", "ACTIVE");
  if (credentialId) query = query.eq("id", credentialId);
  else query = query.eq("provider_id", providerId);
  if (credentialType) query = query.eq("credential_type", credentialType);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;
  const credential = (data || []).find((row) => { const scope = text(row.metadata?.organization_id); return !scope || scope === organizationId; }) || null;
  if (!credential) throw new Error("FINANCE_PROVIDER_CREDENTIAL_REQUIRED");
  return credential;
}

async function resolvedSecret({ organizationId, credential }) {
  const resolved = await resolveProviderCredentialSecret({ credential_id: credential.id, provider_id: credential.provider_id, organization_id: organizationId, secret_reference: credential.secret_reference });
  return parseSecret(resolved.secret);
}

async function recordCredentialVerification({ organizationId, credential, status, detail = {}, error = null, actorId = null }) {
  const result = await supabaseAdmin.rpc("record_finance_provider_verification", {
    p_organization_id: organizationId,
    p_credential_id: credential.id,
    p_status: status,
    p_mode: detail?.verification_mode || (error ? "PROVIDER_REQUEST" : null),
    p_detail: detail || {},
    p_error_code: error ? text(error.code || "PROVIDER_VERIFICATION_FAILED", 200) : null,
    p_error_message: error ? text(error.message || error, 1000) : null,
    p_verified_by: actorId || null,
  });
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data[0] : result.data;
}

async function snapshot(organizationId) {
  const credentials = await supabaseAdmin.from("provider_credentials")
    .select("id,provider_id,credential_type,status,metadata,created_at,updated_at")
    .in("provider_id", ["brankas_statement", "certified_etax_rest", "netbay_invoicechain", "inet_etax", "email_google", "email_microsoft", "email_imap"])
    .eq("status", "ACTIVE")
    .order("updated_at", { ascending: false });
  if (credentials.error) throw credentials.error;

  const scoped = (credentials.data || []).filter((row) => {
    const scope = text(row.metadata?.organization_id);
    return !scope || scope === organizationId;
  });
  const bank = scoped.find((row) => row.provider_id === "brankas_statement") || null;
  const etax = scoped.find((row) => ETAX_PROVIDERS.has(row.provider_id) && upper(row.metadata?.purpose) === "FINANCE_ETAX_PROVIDER") || null;
  const email = scoped.find((row) => EMAIL_PROVIDERS.has(row.provider_id) && upper(row.metadata?.purpose).includes("MAILBOX")) || null;

  const profileResult = await supabaseAdmin.from("finance_e_invoicing_settings")
    .select("id,network,jurisdiction_code,document_type,sender_identifier,status,provider_code,provider_credential_id,standard_code,standard_version,provider_status,last_verified_at,last_error_code,last_error_message,updated_at")
    .eq("organization_id", organizationId)
    .eq("jurisdiction_code", "TH")
    .eq("document_type", "CUSTOMER_INVOICE")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;
  const verificationResult = await supabaseAdmin.from("finance_provider_verification_events")
    .select("id,provider_credential_id,provider_id,verification_status,verification_mode,non_mutating,error_code,error_message,verified_at")
    .eq("organization_id", organizationId).order("verified_at", { ascending: false }).limit(25);
  if (verificationResult.error) throw verificationResult.error;
  const verificationEvents = verificationResult.data || [];

  return {
    bank: bank ? {
      ready: true,
      credential_id: bank.id,
      provider_id: bank.provider_id,
      environment: bank.metadata?.environment || null,
      base_url: bank.metadata?.base_url || null,
      updated_at: bank.updated_at,
      verification_status: bank.metadata?.verification_status || "CONFIGURED_UNVERIFIED",
      last_verified_at: bank.metadata?.last_verified_at || null,
      last_verification_attempt_at: bank.metadata?.last_verification_attempt_at || null,
      last_verification_error: bank.metadata?.last_verification_error || null,
      verification_history: verificationEvents.filter((row) => row.provider_id === "brankas_statement").slice(0, 5),
    } : { ready: false, provider_id: "brankas_statement", verification_status: "NOT_CONFIGURED", verification_history: [] },
    etax: {
      ready: Boolean(etax && profileResult.data && upper(profileResult.data.status) === "ACTIVE" && profileResult.data.provider_credential_id === etax.id),
      credential: etax ? {
        credential_id: etax.id,
        provider_id: etax.provider_id,
        base_url: etax.metadata?.base_url || null,
        upload_path: etax.metadata?.upload_path || null,
        status_path: etax.metadata?.status_path || null,
        updated_at: etax.updated_at,
        verification_status: etax.metadata?.verification_status || "CONFIGURED_UNVERIFIED",
        last_verified_at: etax.metadata?.last_verified_at || null,
        last_verification_attempt_at: etax.metadata?.last_verification_attempt_at || null,
        last_verification_error: etax.metadata?.last_verification_error || null,
        verification_history: verificationEvents.filter((row) => ETAX_PROVIDERS.has(row.provider_id)).slice(0, 5),
      } : null,
      profile: profileResult.data || null,
    },
    email: email ? {
      ready: true,
      provider_id: email.provider_id,
      credential_id: email.id,
      updated_at: email.updated_at,
    } : {
      ready: false,
      setup_path: `/workspace/${organizationId}/administration/integrations/email-connect`,
    },
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const auth = await requireConfig(request, organizationId);
    if (auth.response) return auth.response;
    return NextResponse.json({ success: true, ...(await snapshot(auth.access.organizationId)) });
  } catch (error) {
    const message = error?.message || "Provider activation status failed";
    return NextResponse.json({ success: false, error: message }, { status: /permission denied/i.test(message) ? 403 : 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id);
    const auth = await requireConfig(request, organizationId);
    if (auth.response) return auth.response;
    const orgId = auth.access.organizationId;
    const action = text(body.action).toLowerCase();

    if (action === "activate_bank_feed") {
      const apiKey = text(body.apiKey || body.api_key, 8000);
      if (!apiKey) return NextResponse.json({ success: false, error: "Brankas API key required" }, { status: 400 });

      const environment = text(body.environment || "sandbox", 32).toLowerCase();
      if (!["sandbox", "production"].includes(environment)) {
        return NextResponse.json({ success: false, error: "Bank-feed environment must be sandbox or production" }, { status: 400 });
      }
      const baseUrl = text(
        body.baseUrl || body.base_url || (environment === "sandbox" ? "https://statement.sandbox.bnk.to" : ""),
        1000
      ).replace(/\/$/, "");
      if (!/^https:\/\//i.test(baseUrl)) {
        return NextResponse.json({ success: false, error: "HTTPS Brankas base URL required" }, { status: 400 });
      }

      const credential = await provision({
        organizationId: orgId,
        providerId: "brankas_statement",
        credentialType: "finance_bank_feed_api",
        secretPayload: { api_key: apiKey },
        metadata: { purpose: "FINANCE_BANK_FEED", environment, base_url: baseUrl, verification_status: "CONFIGURED_UNVERIFIED" },
      });

      const integrations = await supabaseAdmin.from("finance_banking_integrations").update({
        provider_credential_id: credential.credential_id,
        credential_reference: credential.credential_id,
        status: "PENDING_CONSENT",
        last_error_code: null,
        last_error_message: null,
        updated_at: now(),
      })
        .eq("organization_id", orgId)
        .eq("provider_name", "brankas_statement")
        .eq("connection_type", "TRANSACTION_FEED")
        .in("status", ["PENDING_CREDENTIAL", "PENDING_SETUP", "PENDING_CONSENT"])
        .select("id,status");
      if (integrations.error) throw integrations.error;

      return NextResponse.json({
        success: true,
        activation: "BANK_FEED",
        credential: {
          credential_id: credential.credential_id,
          provider_id: credential.provider_id,
          status: credential.status,
          operation: credential.operation,
        },
        rebound_connections: integrations.data || [],
        status: await snapshot(orgId),
      });
    }

    if (action === "activate_etax") {
      const providerCode = text(body.providerCode || body.provider_code).toLowerCase();
      if (!ETAX_PROVIDERS.has(providerCode)) {
        return NextResponse.json({ success: false, error: "Supported certified e-Tax provider required" }, { status: 400 });
      }

      const senderIdentifier = text(body.senderIdentifier || body.sender_identifier, 240);
      const baseUrl = text(body.baseUrl || body.base_url, 1000).replace(/\/$/, "");
      const uploadPath = text(body.uploadPath || body.upload_path, 1000);
      const statusPath = text(body.statusPath || body.status_path, 1000);
      if (!senderIdentifier) return NextResponse.json({ success: false, error: "Registered sender identifier required" }, { status: 400 });
      if (!/^https:\/\//i.test(baseUrl)) return NextResponse.json({ success: false, error: "HTTPS certified-provider base URL required" }, { status: 400 });
      if (!uploadPath) return NextResponse.json({ success: false, error: "Provider upload path required" }, { status: 400 });
      if (!statusPath) return NextResponse.json({ success: false, error: "Provider status path required" }, { status: 400 });

      const secret = {
        ...(text(body.apiKey || body.api_key, 8000) ? { api_key: text(body.apiKey || body.api_key, 8000) } : {}),
        ...(text(body.accessToken || body.access_token, 12000) ? { access_token: text(body.accessToken || body.access_token, 12000) } : {}),
        ...(text(body.username, 1000) ? { username: text(body.username, 1000) } : {}),
        ...(text(body.password, 8000) ? { password: text(body.password, 8000) } : {}),
        ...(text(body.serverKey || body.server_key, 8000) ? { server_key: text(body.serverKey || body.server_key, 8000) } : {}),
      };
      if (!(secret.api_key || secret.access_token || (secret.username && secret.password))) {
        return NextResponse.json({ success: false, error: "Provider API key, access token, or username/password required" }, { status: 400 });
      }

      const metadata = {
        purpose: "FINANCE_ETAX_PROVIDER",
        verification_status: "CONFIGURED_UNVERIFIED",
        base_url: baseUrl,
        upload_path: uploadPath,
        status_path: statusPath,
        ...(text(body.authPath || body.auth_path, 1000) ? { auth_path: text(body.authPath || body.auth_path, 1000) } : {}),
        ...(text(body.healthPath || body.health_path, 1000) ? { health_path: text(body.healthPath || body.health_path, 1000) } : {}),
        health_method: text(body.healthMethod || body.health_method || "GET", 16).toUpperCase(),
        auth_method: text(body.authMethod || body.auth_method || "POST", 16).toUpperCase(),
        upload_method: text(body.uploadMethod || body.upload_method || "POST", 16).toUpperCase(),
        status_method: text(body.statusMethod || body.status_method || "GET", 16).toUpperCase(),
        api_key_header: text(body.apiKeyHeader || body.api_key_header || "x-api-key", 120),
        server_key_header: text(body.serverKeyHeader || body.server_key_header || "x-server-key", 120),
        auth_scheme: text(body.authScheme || body.auth_scheme || "Bearer", 80),
      };

      const credential = await provision({
        organizationId: orgId,
        providerId: providerCode,
        credentialType: "finance_etax_provider",
        secretPayload: secret,
        metadata,
      });

      const existingResult = await supabaseAdmin.from("finance_e_invoicing_settings").select("id,sender_identifier,updated_at")
        .eq("organization_id", orgId)
        .eq("jurisdiction_code", "TH")
        .eq("document_type", "CUSTOMER_INVOICE")
        .order("updated_at", { ascending: false });
      if (existingResult.error) throw existingResult.error;
      const existingProfiles = existingResult.data || [];
      const selectedProfile = existingProfiles.find((row) => text(row.sender_identifier) === senderIdentifier) || existingProfiles[0] || null;

      const deactivate = await supabaseAdmin.from("finance_e_invoicing_settings").update({
        status: "INACTIVE",
        updated_at: now(),
      })
        .eq("organization_id", orgId)
        .eq("jurisdiction_code", "TH")
        .eq("document_type", "CUSTOMER_INVOICE");
      if (deactivate.error) throw deactivate.error;

      const profilePatch = {
        network: "TH_RD_ETAX",
        jurisdiction_code: "TH",
        document_type: "CUSTOMER_INVOICE",
        sender_identifier: senderIdentifier,
        status: "ACTIVE",
        provider_code: providerCode,
        provider_credential_id: credential.credential_id,
        standard_code: "ETDA_CII",
        standard_version: "2.0",
        provider_status: "CONFIGURED",
        last_verified_at: null,
        last_error_code: null,
        last_error_message: null,
        metadata: {
          managed_by: "AVANTIQO",
          authority: "THAILAND_RD_ETAX",
          credential_transport: "SUPABASE_VAULT",
        },
        updated_at: now(),
      };

      let profile;
      if (selectedProfile?.id) {
        const updated = await supabaseAdmin.from("finance_e_invoicing_settings").update(profilePatch)
          .eq("organization_id", orgId)
          .eq("id", selectedProfile.id)
          .select("*")
          .single();
        if (updated.error) throw updated.error;
        profile = updated.data;
      } else {
        const inserted = await supabaseAdmin.from("finance_e_invoicing_settings").insert({
          organization_id: orgId,
          ...profilePatch,
          created_by: auth.access.user?.id || null,
          created_at: now(),
        }).select("*").single();
        if (inserted.error) throw inserted.error;
        profile = inserted.data;
      }

      return NextResponse.json({
        success: true,
        activation: "ETAX",
        credential: {
          credential_id: credential.credential_id,
          provider_id: credential.provider_id,
          status: credential.status,
          operation: credential.operation,
        },
        profile,
        status: await snapshot(orgId),
      });
    }

    if (action === "verify_bank_feed") {
      const credential = await loadScopedCredential({ organizationId: orgId, providerId: "brankas_statement", credentialType: "finance_bank_feed_api" });
      const provider = getBankFeedProvider("brankas_statement");
      const secret = await resolvedSecret({ organizationId: orgId, credential });
      try {
        const result = await provider.verifyCredential({ secret, config: credential.metadata || {} });
        await recordCredentialVerification({ organizationId: orgId, credential, status: result.verified ? "VERIFIED" : "CONFIGURED_UNVERIFIED", detail: result, actorId: staffId(auth.access) });
        return NextResponse.json({ success: true, activation: "BANK_FEED", verification: result, status: await snapshot(orgId) });
      } catch (error) {
        await recordCredentialVerification({ organizationId: orgId, credential, status: "VERIFICATION_FAILED", error, actorId: staffId(auth.access) });
        return NextResponse.json({ success: false, error: error?.message || "Bank provider verification failed", code: error?.code || "BANK_PROVIDER_VERIFICATION_FAILED", status: await snapshot(orgId) }, { status: 409 });
      }
    }

    if (action === "verify_etax") {
      const profileResult = await supabaseAdmin.from("finance_e_invoicing_settings").select("*").eq("organization_id", orgId).eq("jurisdiction_code", "TH").eq("document_type", "CUSTOMER_INVOICE").eq("status", "ACTIVE").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (profileResult.error) throw profileResult.error;
      const profile = profileResult.data;
      if (!profile?.provider_credential_id) return NextResponse.json({ success: false, error: "Active Thailand e-Tax provider credential required" }, { status: 400 });
      const credential = await loadScopedCredential({ organizationId: orgId, providerId: profile.provider_code, credentialId: profile.provider_credential_id, credentialType: "finance_etax_provider" });
      const provider = getEInvoiceProvider(profile.provider_code);
      const secret = await resolvedSecret({ organizationId: orgId, credential });
      try {
        const result = await provider.verifyCredential({ secret, config: credential.metadata || {} });
        const verificationStatus = result.verified ? "VERIFIED" : "CONFIGURED_UNVERIFIED";
        await recordCredentialVerification({ organizationId: orgId, credential, status: verificationStatus, detail: result, actorId: staffId(auth.access) });
        const profilePatch = result.verified ? { provider_status: "VERIFIED", last_verified_at: now(), last_error_code: null, last_error_message: null, updated_at: now() } : { provider_status: "CONFIGURED_UNVERIFIED", last_verified_at: null, last_error_code: "E_INVOICE_PROVIDER_NON_MUTATING_VERIFICATION_UNAVAILABLE", last_error_message: result.reason || "Provider does not expose a non-mutating verification endpoint.", updated_at: now() };
        const updated = await supabaseAdmin.from("finance_e_invoicing_settings").update(profilePatch).eq("organization_id", orgId).eq("id", profile.id);
        if (updated.error) throw updated.error;
        return NextResponse.json({ success: true, activation: "ETAX", verification: result, status: await snapshot(orgId) });
      } catch (error) {
        await recordCredentialVerification({ organizationId: orgId, credential, status: "VERIFICATION_FAILED", error, actorId: staffId(auth.access) });
        await supabaseAdmin.from("finance_e_invoicing_settings").update({ provider_status: "VERIFICATION_FAILED", last_verified_at: null, last_error_code: text(error?.code || "E_INVOICE_PROVIDER_VERIFICATION_FAILED", 200), last_error_message: text(error?.message || error, 1000), updated_at: now() }).eq("organization_id", orgId).eq("id", profile.id);
        return NextResponse.json({ success: false, error: error?.message || "e-Tax provider verification failed", code: error?.code || "E_INVOICE_PROVIDER_VERIFICATION_FAILED", status: await snapshot(orgId) }, { status: 409 });
      }
    }

    return NextResponse.json({ success: false, error: "Unsupported Finance provider activation action" }, { status: 400 });
  } catch (error) {
    const message = error?.message || "Finance provider activation failed";
    const status = /permission denied/i.test(message)
      ? 403
      : /required|unsupported|must be|HTTPS/i.test(message)
        ? 400
        : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
