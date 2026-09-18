import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveProviderCredentialSecret } from "@/lib/platform/service-runtime/credentials/runtime/ProviderCredentialSecretBroker";
import { getEInvoiceProvider } from "@/lib/finance/e-invoicing/providers/EInvoiceProviderRegistry";
import { buildThaiEtaxCrossIndustryInvoiceXml, preflightThaiEtaxInvoice } from "./ThaiEtaxSourceDocument";

const text = (value) => String(value ?? "").trim();
const upper = (value) => text(value).toUpperCase();
const now = () => new Date().toISOString();
const hash = (value) => crypto.createHash("sha256").update(String(value ?? "")).digest("hex");

function parseSecret(value) {
  if (value && typeof value === "object") return value;
  const raw = text(value);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { api_key: raw }; }
}

async function loadInvoice({ organizationId, entityId, invoiceId }) {
  const invoiceResult = await supabaseAdmin.from("customer_invoices").select("*")
    .eq("organization_id", organizationId).eq("entity_id", entityId).eq("id", invoiceId).maybeSingle();
  if (invoiceResult.error) throw invoiceResult.error;
  if (!invoiceResult.data) throw new Error("E_INVOICE_CUSTOMER_INVOICE_NOT_FOUND");
  const invoice = invoiceResult.data;
  const [linesResult, sellerResult, buyerResult] = await Promise.all([
    supabaseAdmin.from("customer_invoice_lines").select("*")
      .eq("organization_id", organizationId).eq("entity_id", entityId)
      .eq("customer_invoice_id", invoiceId).order("created_at"),
    supabaseAdmin.from("legal_entities")
      .select("id,legal_name,display_name,tax_id,country,currency,address,email,phone,is_active")
      .eq("organization_id", organizationId).eq("id", entityId).maybeSingle(),
    supabaseAdmin.from("parties")
      .select("id,display_name,legal_name,tax_id,address,email,phone,status")
      .eq("organization_id", organizationId).eq("id", invoice.party_id || invoice.customer_id).maybeSingle(),
  ]);
  if (linesResult.error) throw linesResult.error;
  if (sellerResult.error) throw sellerResult.error;
  if (buyerResult.error) throw buyerResult.error;
  return { invoice, lines: linesResult.data || [], seller: sellerResult.data, buyer: buyerResult.data };
}

async function loadSetting({ organizationId }) {
  const result = await supabaseAdmin.from("finance_e_invoicing_settings").select("*")
    .eq("organization_id", organizationId).eq("jurisdiction_code", "TH")
    .eq("document_type", "CUSTOMER_INVOICE").order("updated_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data || []).find((row) => upper(row.status) === "ACTIVE") || (result.data || [])[0] || null;
}
async function loadCredential({ organizationId, setting }) {
  if (!setting?.provider_credential_id) return null;
  const result = await supabaseAdmin.from("provider_credentials")
    .select("id,provider_id,secret_reference,status,metadata")
    .eq("id", setting.provider_credential_id).maybeSingle();
  if (result.error) throw result.error;
  const credential = result.data;
  if (!credential || upper(credential.status) !== "ACTIVE") return null;
  const scoped = text(credential.metadata?.organization_id);
  if (scoped && scoped !== organizationId) throw new Error("E_INVOICE_PROVIDER_CREDENTIAL_SCOPE_MISMATCH");
  return credential;
}

export async function getCustomerInvoiceEInvoiceReadiness({ organizationId, entityId, invoiceId } = {}) {
  if (!organizationId || !entityId || !invoiceId) throw new Error("E_INVOICE_SCOPE_REQUIRED");
  const context = await loadInvoice({ organizationId, entityId, invoiceId });
  const setting = await loadSetting({ organizationId });
  const blockers = [];
  if (!setting) blockers.push({ code: "E_INVOICE_PROFILE_REQUIRED", message: "Configure a Thailand e-Invoicing profile first." });
  else if (upper(setting.status) !== "ACTIVE") blockers.push({ code: "E_INVOICE_PROFILE_INACTIVE", message: "The Thailand e-Invoicing profile is not active." });
  const credential = setting ? await loadCredential({ organizationId, setting }) : null;
  if (setting && !credential) blockers.push({ code: "E_INVOICE_PROVIDER_CREDENTIAL_REQUIRED", message: "Install the certified provider credential before transmitting." });
  if (credential && !text(credential.metadata?.base_url)) blockers.push({ code: "E_INVOICE_PROVIDER_BASE_URL_REQUIRED", message: "Certified provider base URL is not configured." });
  if (credential && !text(credential.metadata?.upload_path)) blockers.push({ code: "E_INVOICE_PROVIDER_UPLOAD_PATH_REQUIRED", message: "Certified provider upload endpoint is not configured." });
  const source = setting ? preflightThaiEtaxInvoice({ ...context, setting }) : { blockers: [] };
  blockers.push(...(source.blockers || []));
  const txResult = await supabaseAdmin.from("finance_e_invoice_transmissions")
    .select("id,status,provider_code,provider_tracking_id,provider_reference,authority_reference,provider_status_code,provider_status_message,source_hash,attempt_count,submitted_at,accepted_at,rejected_at,failed_at,last_status_checked_at,created_at,updated_at")
    .eq("organization_id", organizationId).eq("entity_id", entityId)
    .eq("customer_invoice_id", invoiceId).order("created_at", { ascending: false }).limit(25);
  if (txResult.error) throw txResult.error;
  return {
    ready: blockers.length === 0,
    blockers,
    setting,
    credential_ready: Boolean(credential),
    invoice: context.invoice,
    transmissions: txResult.data || [],
  };
}

async function providerContext({ organizationId, setting }) {
  const credential = await loadCredential({ organizationId, setting });
  if (!credential) throw new Error("E_INVOICE_PROVIDER_CREDENTIAL_REQUIRED");
  const resolved = await resolveProviderCredentialSecret({
    credential_id: credential.id,
    provider_id: setting.provider_code,
    organization_id: organizationId,
    secret_reference: credential.secret_reference,
  });
  return {
    credential,
    secret: parseSecret(resolved.secret),
    provider: getEInvoiceProvider(setting.provider_code),
  };
}

function statusTimes(status) {
  const stamp = now();
  if (status === "ACCEPTED") return { accepted_at: stamp };
  if (status === "REJECTED") return { rejected_at: stamp };
  if (status === "FAILED") return { failed_at: stamp };
  return {};
}

async function updateFromProvider({ transmissionId, result, incrementAttempt = false }) {
  const status = upper(result?.status || "SUBMITTED");
  const patch = {
    status,
    provider_tracking_id: result?.provider_tracking_id || undefined,
    provider_reference: result?.provider_reference || undefined,
    authority_reference: result?.authority_reference || undefined,
    provider_status_code: result?.provider_status_code || null,
    provider_status_message: result?.provider_status_message || null,
    response_evidence: result?.evidence || {},
    last_status_checked_at: now(),
    updated_at: now(),
    ...(status === "SUBMITTED" ? { submitted_at: now() } : {}),
    ...statusTimes(status),
  };
  if (incrementAttempt) {
    const current = await supabaseAdmin.from("finance_e_invoice_transmissions")
      .select("attempt_count").eq("id", transmissionId).maybeSingle();
    if (current.error) throw current.error;
    patch.attempt_count = Number(current.data?.attempt_count || 0) + 1;
  }
  const resultRow = await supabaseAdmin.from("finance_e_invoice_transmissions")
    .update(patch).eq("id", transmissionId).select("*").single();
  if (resultRow.error) throw resultRow.error;
  return resultRow.data;
}

export async function submitCustomerInvoiceEInvoice({
  organizationId, entityId, invoiceId, actorId = null, callbackBaseUrl = null,
} = {}) {
  const readiness = await getCustomerInvoiceEInvoiceReadiness({ organizationId, entityId, invoiceId });
  if (!readiness.ready) {
    const error = new Error("E_INVOICE_PREFLIGHT_BLOCKED");
    error.code = "E_INVOICE_PREFLIGHT_BLOCKED";
    error.blockers = readiness.blockers;
    throw error;
  }
  const context = await loadInvoice({ organizationId, entityId, invoiceId });
  const setting = readiness.setting;
  const source = buildThaiEtaxCrossIndustryInvoiceXml({ ...context, setting });
  const idempotencyKey = ["e-invoice", organizationId, invoiceId, source.source_hash].join(":");
  const callbackToken = crypto.randomBytes(32).toString("base64url");
  const callbackTokenHash = hash(callbackToken);
  const insert = await supabaseAdmin.from("finance_e_invoice_transmissions").insert({
    organization_id: organizationId,
    entity_id: entityId,
    customer_invoice_id: invoiceId,
    setting_id: setting.id,
    provider_code: setting.provider_code,
    network: setting.network,
    jurisdiction_code: setting.jurisdiction_code,
    document_type: setting.document_type,
    standard_code: setting.standard_code || "ETDA_CII",
    standard_version: setting.standard_version || "2.0",
    source_hash: source.source_hash,
    idempotency_key: idempotencyKey,
    source_xml: source.xml,
    callback_token_hash: callbackTokenHash,
    created_by: actorId,
    request_evidence: { preflight: source.preflight, invoice_number: context.invoice.invoice_number },
  }).select("*").single();

  let transmission = insert.data;
  if (insert.error && String(insert.error.code) !== "23505") throw insert.error;
  if (insert.error) {
    const existing = await supabaseAdmin.from("finance_e_invoice_transmissions").select("*")
      .eq("organization_id", organizationId).eq("customer_invoice_id", invoiceId)
      .eq("source_hash", source.source_hash).maybeSingle();
    if (existing.error) throw existing.error;
    transmission = existing.data;
    if (["SUBMITTING", "SUBMITTED", "ACCEPTED"].includes(upper(transmission?.status))) {
      return { success: true, replay: true, transmission };
    }
    if (upper(transmission?.status) === "REJECTED") {
      const error = new Error("E_INVOICE_REJECTED_SOURCE_UNCHANGED");
      error.code = "E_INVOICE_REJECTED_SOURCE_UNCHANGED";
      throw error;
    }
    await supabaseAdmin.from("finance_e_invoice_transmissions")
      .update({ callback_token_hash: callbackTokenHash, updated_at: now() }).eq("id", transmission.id);
  }

  const { credential, secret, provider } = await providerContext({ organizationId, setting });
  const base = callbackBaseUrl ? String(callbackBaseUrl).replace(/\/$/, "") : "";
  const callbackUrl = base
    ? base + "/api/public/finance/e-invoice/" + encodeURIComponent(transmission.id)
      + "/callback?token=" + encodeURIComponent(callbackToken)
    : null;

  await supabaseAdmin.from("finance_e_invoice_transmissions")
    .update({ status: "SUBMITTING", updated_at: now() }).eq("id", transmission.id);
  try {
    const providerResult = await provider.submit({
      secret,
      config: credential.metadata || {},
      xml: source.xml,
      transmission: {
        ...transmission,
        invoice_number: context.invoice.invoice_number,
        sender_identifier: setting.sender_identifier,
        callback_url: callbackUrl,
      },
    });
    const updated = await updateFromProvider({
      transmissionId: transmission.id,
      result: providerResult,
      incrementAttempt: true,
    });
    return { success: true, replay: false, transmission: updated };
  } catch (error) {
    const failed = await supabaseAdmin.from("finance_e_invoice_transmissions").update({
      status: "FAILED",
      attempt_count: Number(transmission.attempt_count || 0) + 1,
      provider_status_code: text(error?.code) || null,
      provider_status_message: text(error?.message).slice(0, 1000),
      response_evidence: error?.body || {},
      failed_at: now(),
      updated_at: now(),
    }).eq("id", transmission.id).select("*").single();
    if (failed.error) throw failed.error;
    throw error;
  }
}

export async function refreshCustomerInvoiceEInvoiceStatus({
  organizationId, entityId, invoiceId, transmissionId = null,
} = {}) {
  let query = supabaseAdmin.from("finance_e_invoice_transmissions").select("*")
    .eq("organization_id", organizationId).eq("entity_id", entityId)
    .eq("customer_invoice_id", invoiceId);
  if (transmissionId) query = query.eq("id", transmissionId);
  const current = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw new Error("E_INVOICE_TRANSMISSION_NOT_FOUND");
  if (["ACCEPTED", "REJECTED", "CANCELLED"].includes(upper(current.data.status))) {
    return { success: true, terminal: true, transmission: current.data };
  }
  if (!current.data.provider_tracking_id) throw new Error("E_INVOICE_PROVIDER_TRACKING_ID_REQUIRED");

  const settingResult = await supabaseAdmin.from("finance_e_invoicing_settings")
    .select("*").eq("organization_id", organizationId).eq("id", current.data.setting_id).maybeSingle();
  if (settingResult.error) throw settingResult.error;
  if (!settingResult.data) throw new Error("E_INVOICE_PROFILE_NOT_FOUND");
  const { credential, secret, provider } = await providerContext({
    organizationId,
    setting: settingResult.data,
  });
  const providerResult = await provider.status({
    secret,
    config: credential.metadata || {},
    providerTrackingId: current.data.provider_tracking_id,
  });
  const updated = await updateFromProvider({
    transmissionId: current.data.id,
    result: providerResult,
  });
  return {
    success: true,
    terminal: ["ACCEPTED", "REJECTED"].includes(upper(updated.status)),
    transmission: updated,
  };
}

export async function processEInvoiceCallback({ transmissionId, callbackToken, payload } = {}) {
  const result = await supabaseAdmin.from("finance_e_invoice_transmissions")
    .select("*").eq("id", transmissionId).maybeSingle();
  if (result.error) throw result.error;
  const transmission = result.data;
  if (!transmission) throw new Error("E_INVOICE_TRANSMISSION_NOT_FOUND");
  const expected = text(transmission.callback_token_hash);
  const actual = hash(callbackToken);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (!expected || expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("E_INVOICE_CALLBACK_TOKEN_INVALID");
  }

  const provider = getEInvoiceProvider(transmission.provider_code);
  const providerEventId = provider.eventId(payload);
  const payloadHash = provider.payloadHash(payload);
  const mapped = provider.mapCallback(payload);
  const eventInsert = await supabaseAdmin.from("finance_e_invoice_events").insert({
    organization_id: transmission.organization_id,
    transmission_id: transmission.id,
    provider_code: transmission.provider_code,
    provider_event_id: providerEventId,
    event_type: text(payload?.event_type || payload?.type) || null,
    status: mapped.status,
    payload_hash: payloadHash,
    payload: payload || {},
  }).select("*").single();
  if (eventInsert.error && String(eventInsert.error.code) !== "23505") throw eventInsert.error;
  if (eventInsert.error) return { success: true, replay: true, transmission };
  const updated = await updateFromProvider({
    transmissionId: transmission.id,
    result: mapped,
  });
  await supabaseAdmin.from("finance_e_invoice_events").update({
    processing_status: "PROCESSED",
    processed_at: now(),
  }).eq("id", eventInsert.data.id);
  return { success: true, replay: false, transmission: updated };
}
