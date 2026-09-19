export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

const CONNECTION_TYPES = Object.freeze({
  TRANSACTION_FEED: "Transaction Feed",
  STATEMENT_IMPORT: "Statement Import",
  BALANCE_SYNC: "Balance Sync",
});

const PROVIDER_LABELS = Object.freeze({
  brankas_statement: "Brankas Statement",
  AVANTIQO_MANAGED: "Avantiqo Managed",
});

function normalizeConnectionType(value) {
  return String(value || "").trim().toUpperCase();
}

function resolveThailandBrankasBankCode(bankAccount = {}) {
  const haystack = `${bankAccount.bank_name || ""} ${bankAccount.account_name || ""}`.toUpperCase();
  if (/KASIKORN|K-BANK|KBANK|K BANK/.test(haystack)) return "KASIKORNBANK_PERSONAL";
  return null;
}


function decorateIntegration(row, bankAccount = null, credential = null) {
  const connectionLabel =
    CONNECTION_TYPES[row.connection_type] ||
    String(row.connection_type || "Bank Connection")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  const accountName = bankAccount?.account_name || bankAccount?.name || "Bank Account";

  return {
    id: row.id,
    organization_id: row.organization_id,
    bank_account_id: row.bank_account_id,
    bank_account_name: accountName,
    bank_name: bankAccount?.bank_name || null,
    currency_code: bankAccount?.currency_code || bankAccount?.currency || null,
    connection_type: row.connection_type,
    connection_label: connectionLabel,
    provider_name: row.provider_name || "AVANTIQO_MANAGED",
    provider_display_name: PROVIDER_LABELS[row.provider_name] || row.provider_name || "Avantiqo Managed",
    provider_country_code: row.provider_country_code || null,
    provider_bank_code: row.provider_bank_code || null,
    status: row.status || "PENDING_SETUP",
    sync_status: row.sync_status || "NEVER_SYNCED",
    last_sync_at: row.last_sync_at || row.last_sync_completed_at || null,
    last_sync_completed_at: row.last_sync_completed_at || null,
    consent_expires_at: row.consent_expires_at || null,
    last_error_code: row.last_error_code || null,
    last_error_message: row.last_error_message || null,
    provider_ready: Boolean(row.provider_credential_id),
    provider_verification_status: credential?.metadata?.verification_status || (row.provider_credential_id ? "CONFIGURED_UNVERIFIED" : "NOT_CONFIGURED"),
    provider_last_verified_at: credential?.metadata?.last_verified_at || null,
    provider_last_verification_attempt_at: credential?.metadata?.last_verification_attempt_at || null,
    provider_last_verification_error: credential?.metadata?.last_verification_error || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    name: accountName,
    title: accountName,
    code: connectionLabel,
  };
}

async function loadBankAccounts(organizationId, ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabaseAdmin
    .from("bank_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .in("id", uniqueIds);

  if (error) throw error;
  return new Map((data || []).map((row) => [String(row.id), row]));
}

async function loadProviderCredentials(organizationId, ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) return new Map();
  const { data, error } = await supabaseAdmin.from("provider_credentials")
    .select("id,provider_id,status,metadata,updated_at").in("id", uniqueIds);
  if (error) throw error;
  return new Map((data || []).filter((row) => { const scope = String(row.metadata?.organization_id || "").trim(); return !scope || scope === organizationId; }).map((row) => [String(row.id), row]));
}

async function requireFinanceBanking(request, organizationId, permissionKey) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return access;

  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey,
    fullAccess: access.permissions?.includes("*") === true,
  });

  return access;
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  return /required|not found|not active|not supported|already exists/i.test(normalized) ? 400 : 500;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireFinanceBanking(
      request,
      searchParams.get("organizationId") || searchParams.get("organization_id"),
      "finance.banking.view"
    );

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, rows: [] },
        { status: access.status }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("finance_banking_integrations")
      .select("id, organization_id, entity_id, bank_account_id, provider_name, provider_country_code, provider_bank_code, provider_credential_id, external_connection_id, external_account_id, connection_type, status, sync_status, last_sync_at, last_sync_completed_at, consent_expires_at, last_error_code, last_error_message, created_at, updated_at")
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const accounts = await loadBankAccounts(
      access.organizationId,
      (data || []).map((row) => row.bank_account_id)
    );
    const credentials = await loadProviderCredentials(access.organizationId, (data || []).map((row) => row.provider_credential_id));
    const rows = (data || []).map((row) =>
      decorateIntegration(row, accounts.get(String(row.bank_account_id)), credentials.get(String(row.provider_credential_id)))
    );

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      rows,
      connections: rows,
    });
  } catch (error) {
    const message = error?.message || "Unable to load bank connections";
    return NextResponse.json(
      { success: false, error: message, rows: [] },
      { status: statusFor(message) }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireFinanceBanking(
      request,
      body.organizationId || body.organization_id,
      "finance.banking.manage"
    );

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const bankAccountId = String(body.bank_account_id || body.bankAccountId || "").trim();
    const connectionType = normalizeConnectionType(body.connection_type || body.connectionType);

    if (!bankAccountId) {
      return NextResponse.json({ success: false, error: "Bank Account required" }, { status: 400 });
    }
    if (!CONNECTION_TYPES[connectionType]) {
      return NextResponse.json({ success: false, error: "Connection Type is not supported" }, { status: 400 });
    }

    const { data: bankAccount, error: bankAccountError } = await supabaseAdmin
      .from("bank_accounts")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("id", bankAccountId)
      .maybeSingle();

    if (bankAccountError) throw bankAccountError;
    if (!bankAccount) {
      return NextResponse.json({ success: false, error: "Bank Account not found in this organisation" }, { status: 400 });
    }

    if (
      bankAccount.active === false ||
      ["ARCHIVED", "INACTIVE"].includes(String(bankAccount.status || "").toUpperCase())
    ) {
      return NextResponse.json({ success: false, error: "Bank Account is not active" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("finance_banking_integrations")
      .select("id, status")
      .eq("organization_id", access.organizationId)
      .eq("bank_account_id", bankAccountId)
      .eq("connection_type", connectionType);

    if (existingError) throw existingError;

    const activeExisting = (existing || []).find(
      (row) => String(row.status || "").toUpperCase() !== "ARCHIVED"
    );
    if (activeExisting) {
      return NextResponse.json(
        { success: false, error: "This bank connection request already exists" },
        { status: 400 }
      );
    }

    let providerName = "AVANTIQO_MANAGED";
    let providerCredentialId = null;
    let providerCountryCode = null;
    let providerBankCode = null;
    let status = "PENDING_SETUP";
    if (connectionType === "TRANSACTION_FEED") {
      let entity = null;
      if (bankAccount.entity_id) {
        const result = await supabaseAdmin.from("legal_entities").select("id,country,is_active").eq("organization_id", access.organizationId).eq("id", bankAccount.entity_id).maybeSingle();
        if (result.error) throw result.error; entity = result.data || null;
      }
      if (!entity?.country) {
        const result = await supabaseAdmin.from("finance_organization_profiles").select("country_code").eq("organization_id", access.organizationId).maybeSingle();
        if (result.error) throw result.error; providerCountryCode = String(result.data?.country_code || "").trim().toUpperCase() || null;
      } else providerCountryCode = String(entity.country || "").trim().toUpperCase() || null;
      if (providerCountryCode === "TH") {
        providerName = "brankas_statement";
        providerBankCode = resolveThailandBrankasBankCode(bankAccount);
      }
      else throw new Error(`No managed live bank-feed provider is configured for ${providerCountryCode || "this country"}`);
      const credentials = await supabaseAdmin.from("provider_credentials").select("id,metadata,created_at").eq("provider_id", providerName).eq("status", "ACTIVE").order("created_at", { ascending: false });
      if (credentials.error) throw credentials.error;
      const match = (credentials.data || []).find((row) => { const scoped = String(row.metadata?.organization_id || "").trim(); return !scoped || scoped === access.organizationId; });
      providerCredentialId = match?.id || null;
      status = providerCredentialId ? "PENDING_CONSENT" : "PENDING_CREDENTIAL";
    }

    const now = new Date().toISOString();
    const { data: created, error: createError } = await supabaseAdmin
      .from("finance_banking_integrations")
      .insert({
        organization_id: access.organizationId,
        bank_account_id: bankAccountId,
        connection_type: connectionType,
        provider_name: providerName,
        provider_credential_id: providerCredentialId,
        credential_reference: providerCredentialId,
        entity_id: bankAccount.entity_id || null,
        provider_country_code: providerCountryCode,
        provider_bank_code: providerBankCode,
        status,
        sync_status: "NEVER_SYNCED",
        created_by: access.user?.id || null,
        updated_at: now,
      })
      .select("id, organization_id, entity_id, bank_account_id, provider_name, provider_country_code, provider_bank_code, provider_credential_id, external_connection_id, external_account_id, connection_type, status, sync_status, last_sync_at, last_sync_completed_at, consent_expires_at, last_error_code, last_error_message, created_at, updated_at")
      .single();

    if (createError) throw createError;

    return NextResponse.json({
      success: true,
      message: providerCredentialId
        ? "Bank feed is ready for customer consent."
        : "Bank feed requested. Add the managed provider credential to enable customer consent.",
      record: decorateIntegration(created, bankAccount),
    });
  } catch (error) {
    const message = error?.message || "Unable to request bank connection";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
