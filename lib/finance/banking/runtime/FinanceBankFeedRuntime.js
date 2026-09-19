import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveProviderCredentialSecret } from "@/lib/platform/service-runtime/credentials/runtime/ProviderCredentialSecretBroker";
import { getBankFeedProvider } from "@/lib/finance/banking/providers/BankFeedProviderRegistry";
import { buildStatementPaymentEvidenceReport } from "@/lib/finance/bank-statements/BankStatementPaymentEvidenceRuntime";

function text(value) { return String(value ?? "").trim(); }
function upper(value) { return text(value).toUpperCase(); }
function parseSecret(value) { const raw = text(value); if (!raw) return {}; try { const parsed = JSON.parse(raw); return parsed && typeof parsed === "object" ? parsed : { api_key: raw }; } catch { return { api_key: raw }; } }
function hash(value) { return crypto.createHash("sha256").update(String(value ?? "")).digest("hex"); }
function isoNow() { return new Date().toISOString(); }
function dateOnly(value) { const candidate = text(value).slice(0,10); if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) throw new Error("BANK_FEED_STATEMENT_DATE_INVALID"); return candidate; }

export async function loadBankFeedIntegration({ organizationId, integrationId } = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!integrationId) throw new Error("integrationId required");
  const { data, error } = await supabaseAdmin.from("finance_banking_integrations")
    .select("*").eq("organization_id", organizationId).eq("id", integrationId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("BANK_FEED_INTEGRATION_NOT_FOUND");
  if (upper(data.connection_type) !== "TRANSACTION_FEED") throw new Error("BANK_FEED_CONNECTION_TYPE_REQUIRED");
  if (upper(data.status) === "ARCHIVED") throw new Error("BANK_FEED_INTEGRATION_ARCHIVED");
  return data;
}

async function providerCredential({ integration }) {
  const credentialId = text(integration.provider_credential_id || integration.credential_reference);
  if (!credentialId) throw new Error("BANK_FEED_PROVIDER_CREDENTIAL_NOT_CONFIGURED");
  const providerName = text(integration.provider_name).toLowerCase();
  const { data: credential, error } = await supabaseAdmin.from("provider_credentials")
    .select("id,provider_id,secret_reference,status,metadata")
    .eq("id", credentialId).maybeSingle();
  if (error) throw error;
  if (!credential) throw new Error("BANK_FEED_PROVIDER_CREDENTIAL_NOT_FOUND");
  const resolved = await resolveProviderCredentialSecret({ credential_id: credential.id, provider_id: providerName, organization_id: integration.organization_id, secret_reference: credential.secret_reference });
  return { credential, secret: parseSecret(resolved.secret) };
}

export async function syncBankFeedIntegration({ organizationId, integrationId, syncMode = "MANUAL" } = {}) {
  const integration = await loadBankFeedIntegration({ organizationId, integrationId });
  if (!integration.external_connection_id) throw new Error("BANK_FEED_CONSENT_REQUIRED");
  const provider = getBankFeedProvider(integration.provider_name);
  if (typeof provider.fetchStatement !== "function") throw new Error("BANK_FEED_PROVIDER_PULL_UNSUPPORTED");
  const { credential, secret } = await providerCredential({ integration });
  const statement = await provider.fetchStatement({ secret, statementId: integration.external_connection_id, config: credential.metadata || {} });
  return await settleBankFeedStatement({ organizationId, integrationId, providerStatement: statement, syncMode, providerRequestId: integration.metadata?.provider_request_id || null });
}

export async function startBankFeedConsent({ organizationId, integrationId, redirectUri, bankCodes = [], countryCode = null, organizationDisplayName = "Avantiqo", consentStateHash = null } = {}) {
  const integration = await loadBankFeedIntegration({ organizationId, integrationId });
  const provider = getBankFeedProvider(integration.provider_name);
  const country = upper(countryCode || integration.provider_country_code || "TH");
  if (!provider.supportsCountry(country)) throw new Error(`BANK_FEED_PROVIDER_COUNTRY_UNSUPPORTED:${country}`);
  const { credential, secret } = await providerCredential({ integration });
  const consent = await provider.createConsentSession({ secret, countryCode: country, bankCodes, externalId: integration.id, redirectUri, organizationDisplayName, config: credential.metadata || {} });
  if (!consent.redirect_url || !consent.external_connection_id) throw new Error("BANK_FEED_PROVIDER_CONSENT_RESPONSE_INVALID");
  const { data, error } = await supabaseAdmin.from("finance_banking_integrations").update({
    provider_country_code: country,
    provider_bank_code: bankCodes[0] || integration.provider_bank_code || null,
    external_connection_id: consent.external_connection_id,
    status: "AWAITING_CONSENT",
    sync_status: "NEVER_SYNCED",
    last_error_code: null,
    last_error_message: null,
    metadata: { ...(integration.metadata || {}), provider_request_id: consent.provider_request_id || null, consent_started_at: isoNow(), consent_granted_at: consent.consent_granted_at || null, consent_state_hash: consentStateHash || integration.metadata?.consent_state_hash || null },
    updated_at: isoNow(),
  }).eq("organization_id", organizationId).eq("id", integrationId).select("*").single();
  if (error) throw error;
  return { integration: data, redirect_url: consent.redirect_url, provider_request_id: consent.provider_request_id || null };
}

async function createSyncRun({ integration, syncMode, idempotencyKey, providerRequestId = null, externalStatementId = null, cursorBefore = null, metadata = {} }) {
  const row = {
    organization_id: integration.organization_id,
    entity_id: integration.entity_id,
    integration_id: integration.id,
    bank_account_id: integration.bank_account_id,
    provider_name: integration.provider_name,
    sync_mode: syncMode,
    idempotency_key: idempotencyKey,
    provider_request_id: providerRequestId,
    external_statement_id: externalStatementId,
    cursor_before: cursorBefore,
    metadata,
  };
  const { data, error } = await supabaseAdmin.from("finance_bank_feed_sync_runs").insert(row).select("*").single();
  if (!error) return { row: data, replay: false };
  if (String(error.code) !== "23505") throw error;
  const existing = await supabaseAdmin.from("finance_bank_feed_sync_runs").select("*").eq("integration_id", integration.id).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing.error) throw existing.error;
  return { row: existing.data, replay: true };
}

async function knownProviderTransactionIds(integrationId, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Set();
  const found = new Set();
  for (let i = 0; i < unique.length; i += 500) {
    const { data, error } = await supabaseAdmin.from("finance_bank_feed_transactions").select("provider_transaction_id").eq("integration_id", integrationId).in("provider_transaction_id", unique.slice(i, i + 500));
    if (error) throw error;
    for (const row of data || []) found.add(row.provider_transaction_id);
  }
  return found;
}

export async function settleBankFeedStatement({ organizationId, integrationId, providerStatement, syncMode = "WEBHOOK", providerRequestId = null } = {}) {
  const integration = await loadBankFeedIntegration({ organizationId, integrationId });
  if (!integration.entity_id) throw new Error("BANK_FEED_ENTITY_REQUIRED");
  if (!integration.bank_account_id) throw new Error("BANK_FEED_BANK_ACCOUNT_REQUIRED");
  const provider = getBankFeedProvider(integration.provider_name);
  const normalized = provider.normalizeStatement(providerStatement, { externalAccountId: integration.external_account_id });
  if (!normalized.statement_start_date || !normalized.statement_end_date || !normalized.currency_code) throw new Error("BANK_FEED_STATEMENT_HEADER_INCOMPLETE");
  const payloadHash = provider.payloadHash(providerStatement);
  const idempotencyKey = `bank-feed:${integration.id}:${normalized.external_statement_id || payloadHash}:${payloadHash}`;
  const sync = await createSyncRun({ integration, syncMode, idempotencyKey, providerRequestId, externalStatementId: normalized.external_statement_id, cursorBefore: integration.sync_cursor, metadata: { provider_status: normalized.raw_status } });
  if (sync.replay && ["COMPLETED","NO_CHANGE"].includes(upper(sync.row?.status))) return { success: true, replay: true, sync_run: sync.row };

  await supabaseAdmin.from("finance_banking_integrations").update({ sync_status: "SYNCING", last_sync_started_at: isoNow(), last_error_code: null, last_error_message: null, updated_at: isoNow() }).eq("id", integration.id).eq("organization_id", organizationId);
  try {
    const known = await knownProviderTransactionIds(integration.id, normalized.transactions.map((row) => row.provider_transaction_id));
    const unseen = normalized.transactions.filter((row) => !known.has(row.provider_transaction_id));
    const previousClosing = Number(integration.metadata?.last_provider_closing_balance);
    const openingBalance = Number.isFinite(previousClosing) ? previousClosing : normalized.opening_balance;
    let statementImportId = null;
    let reconciliation = null;
    let paymentEvidence = null;
    if (unseen.length) {
      const dates = unseen.map((row) => dateOnly(row.transaction_date)).sort();
      const startDate = dates[0];
      const endDate = dates.at(-1);
      const statementNumber = `${normalized.statement_number}:${hash(unseen.map((row) => row.provider_transaction_id).join("|" )).slice(0, 12)}`;
      const imported = await supabaseAdmin.rpc("create_finance_bank_statement_import", {
        p_organization_id: integration.organization_id,
        p_entity_id: integration.entity_id,
        p_bank_account_id: integration.bank_account_id,
        p_statement_number: statementNumber,
        p_statement_start_date: startDate,
        p_statement_end_date: endDate,
        p_opening_balance: openingBalance,
        p_closing_balance: normalized.closing_balance,
        p_currency_code: normalized.currency_code,
        p_import_reference: `${integration.provider_name}:${normalized.external_statement_id || payloadHash}`,
        p_created_by: integration.created_by || null,
        p_lines: unseen.map((row) => ({ transaction_date: row.transaction_date, description: row.description, amount: row.amount, direction: row.direction, reference_number: row.reference_number })),
      });
      if (imported.error) throw imported.error;
      statementImportId = imported.data?.statement_import_id || imported.data?.record?.id || null;
      if (!statementImportId) throw new Error("BANK_FEED_STATEMENT_IMPORT_ID_MISSING");
      const rows = unseen.map((row) => ({
        organization_id: integration.organization_id, entity_id: integration.entity_id, integration_id: integration.id, bank_account_id: integration.bank_account_id,
        provider_name: integration.provider_name, provider_transaction_id: row.provider_transaction_id, external_statement_id: normalized.external_statement_id,
        statement_import_id: statementImportId, transaction_date: dateOnly(row.transaction_date), description: row.description, amount: row.amount, direction: row.direction,
        reference_number: row.reference_number, running_balance: row.running_balance, payload_hash: payloadHash,
      }));
      const stored = await supabaseAdmin.from("finance_bank_feed_transactions").insert(rows);
      if (stored.error) throw stored.error;
      const reconciled = await supabaseAdmin.rpc("finance_reconcile_bank_statement_import_exact_atomic", { p_organization_id: integration.organization_id, p_entity_id: integration.entity_id, p_bank_account_id: integration.bank_account_id, p_statement_import_id: statementImportId, p_reconciled_by: integration.created_by || null });
      reconciliation = reconciled.error ? { success: false, status: "REVIEW_REQUIRED", error: reconciled.error.message } : reconciled.data || null;
      try { paymentEvidence = await buildStatementPaymentEvidenceReport({ organizationId: integration.organization_id, entityId: integration.entity_id, bankAccountId: integration.bank_account_id, statementImportId }); } catch { paymentEvidence = { success: false, reconciliation_authority: false }; }
    }
    const completedAt = isoNow();
    const status = unseen.length ? "COMPLETED" : "NO_CHANGE";
    const updatedMetadata = { ...(integration.metadata || {}), last_provider_closing_balance: normalized.closing_balance, last_external_statement_id: normalized.external_statement_id, last_provider_status: normalized.raw_status || null };
    const integrationUpdate = await supabaseAdmin.from("finance_banking_integrations").update({ external_account_id: normalized.external_account_id || integration.external_account_id || null, provider_bank_code: normalized.bank_code || integration.provider_bank_code || null, sync_cursor: normalized.cursor || integration.sync_cursor || null, sync_status: status, status: "ACTIVE", last_sync_completed_at: completedAt, last_sync_at: completedAt, last_error_code: null, last_error_message: null, metadata: updatedMetadata, updated_at: completedAt }).eq("id", integration.id).eq("organization_id", organizationId);
    if (integrationUpdate.error) throw integrationUpdate.error;
    const runUpdate = await supabaseAdmin.from("finance_bank_feed_sync_runs").update({ cursor_after: normalized.cursor || null, fetched_transaction_count: normalized.transactions.length, imported_transaction_count: unseen.length, duplicate_transaction_count: normalized.transactions.length - unseen.length, statement_import_ids: statementImportId ? [statementImportId] : [], status, metadata: { ...(sync.row?.metadata || {}), reconciliation, payment_evidence: paymentEvidence }, completed_at: completedAt }).eq("id", sync.row.id).select("*").single();
    if (runUpdate.error) throw runUpdate.error;
    return { success: true, replay: false, sync_run: runUpdate.data, statement_import_id: statementImportId, reconciliation, payment_evidence: paymentEvidence };
  } catch (error) {
    const code = text(error?.code) || "BANK_FEED_SYNC_FAILED";
    const message = text(error?.message) || code;
    await Promise.all([
      supabaseAdmin.from("finance_banking_integrations").update({ sync_status: "FAILED", last_error_code: code, last_error_message: message.slice(0,1000), updated_at: isoNow() }).eq("id", integration.id).eq("organization_id", organizationId),
      supabaseAdmin.from("finance_bank_feed_sync_runs").update({ status: "FAILED", error_code: code, error_message: message.slice(0,2000), completed_at: isoNow() }).eq("id", sync.row.id),
    ]);
    throw error;
  }
}

export async function recordBankFeedProviderEvent({ integration, providerPayload, eventType = null, externalStatementId = null } = {}) {
  const provider = getBankFeedProvider(integration.provider_name);
  const providerEventId = provider.eventId(providerPayload);
  const payloadHash = provider.payloadHash(providerPayload);
  const inserted = await supabaseAdmin.from("finance_bank_feed_provider_events").insert({ organization_id: integration.organization_id, integration_id: integration.id, provider_name: integration.provider_name, provider_event_id: providerEventId, event_type: eventType, external_statement_id: externalStatementId, payload_hash: payloadHash, payload: providerPayload || {} }).select("*").single();
  if (!inserted.error) return { event: inserted.data, replay: false };
  if (String(inserted.error.code) !== "23505") throw inserted.error;
  const existing = await supabaseAdmin.from("finance_bank_feed_provider_events").select("*").eq("provider_name", integration.provider_name).eq("provider_event_id", providerEventId).maybeSingle();
  if (existing.error) throw existing.error;
  return { event: existing.data, replay: true };
}
