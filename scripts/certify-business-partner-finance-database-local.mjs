import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const CONTRACT = "AVANTIQO_BUSINESS_PARTNER_FINANCE_DATABASE_CERTIFICATION_V1";
const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
if (!supabaseUrl) throw new Error(`${CONTRACT}_SUPABASE_URL_REQUIRED`);
const parsedUrl = new URL(supabaseUrl);
if (!localHosts.has(parsedUrl.hostname)) throw new Error(`${CONTRACT}_REFUSED_NON_LOCAL_SUPABASE`);
if (!String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()) throw new Error(`${CONTRACT}_SERVICE_ROLE_REQUIRED`);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const { createCustomerInvoiceCommand } = await import("../lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService.js");
const receiptModule = await import("../lib/finance/accounts-receivable/capabilities/postCustomerReceipt.js");

const text = (value) => String(value ?? "").trim();
async function many(query, label) {
  const result = await query;
  if (result.error) throw new Error(`${label}:${result.error.code || "UNKNOWN"}:${result.error.message}`);
  return Array.isArray(result.data) ? result.data : [];
}
async function one(query, label) {
  const result = await query;
  if (result.error) throw new Error(`${label}:${result.error.code || "UNKNOWN"}:${result.error.message}`);
  return result.data || null;
}
const runId = randomUUID();
const tag = `BP_FINANCE_DB_CERT_${runId}`;
let fixture = { organizationId: null, entityId: null, partyId: null, invoiceId: null, paymentId: null };

async function selectLocalFinanceContext() {
  const entities = await many(
    supabaseAdmin.from("legal_entities").select("id,organization_id,currency,status").limit(200),
    "ENTITY_LOOKUP_FAILED",
  );
  for (const entity of entities) {
    const organizationId = text(entity.organization_id);
    const entityId = text(entity.id);
    if (!organizationId || !entityId) continue;
    const [periods, banks, staff] = await Promise.all([
      many(supabaseAdmin.from("accounting_periods").select("id,start_date,end_date,status").eq("organization_id", organizationId).eq("entity_id", entityId).limit(50), "PERIOD_LOOKUP_FAILED"),
      many(supabaseAdmin.from("bank_accounts").select("id,currency,currency_code,active,is_default,finance_account_id").eq("organization_id", organizationId).eq("entity_id", entityId).eq("active", true).limit(50), "BANK_LOOKUP_FAILED"),
      many(supabaseAdmin.from("staff_accounts").select("*").eq("organization_id", organizationId).limit(100), "STAFF_LOOKUP_FAILED"),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const period = periods.find((row) => text(row.status).toUpperCase() === "OPEN" && row.start_date <= today && row.end_date >= today)
      || periods.find((row) => ["OPEN", "ACTIVE"].includes(text(row.status).toUpperCase()));
    const bank = banks.find((row) => row.is_default === true && text(row.finance_account_id)) || banks.find((row) => text(row.finance_account_id));
    const actor = staff.find((row) => text(row.auth_user_id));
    if (period && bank && actor) return { entity, organizationId, entityId, period, bank, actor };
  }
  throw new Error(`${CONTRACT}_LOCAL_FINANCE_CONTEXT_NOT_READY`);
}
async function cleanup() {
  const { organizationId, entityId, partyId, invoiceId, paymentId } = fixture;
  if (!organizationId || !entityId) return;
  const attempts = [];
  if (paymentId) attempts.push(["finance_customer_payment_allocations", supabaseAdmin.from("finance_customer_payment_allocations").delete().eq("organization_id", organizationId).eq("entity_id", entityId).eq("customer_payment_id", paymentId)]);
  if (paymentId) attempts.push(["customer_payments", supabaseAdmin.from("customer_payments").delete().eq("organization_id", organizationId).eq("entity_id", entityId).eq("id", paymentId)]);
  if (invoiceId) attempts.push(["customer_invoice_lines", supabaseAdmin.from("customer_invoice_lines").delete().eq("organization_id", organizationId).eq("entity_id", entityId).eq("customer_invoice_id", invoiceId)]);
  if (invoiceId) attempts.push(["general_ledger", supabaseAdmin.from("general_ledger").delete().eq("organization_id", organizationId).eq("entity_id", entityId).eq("source_document_id", invoiceId)]);
  if (paymentId) attempts.push(["general_ledger_payment", supabaseAdmin.from("general_ledger").delete().eq("organization_id", organizationId).eq("entity_id", entityId).eq("source_document_id", paymentId)]);
  if (invoiceId) attempts.push(["journal_entries", supabaseAdmin.from("journal_entries").delete().eq("organization_id", organizationId).eq("entity_id", entityId).eq("source_document_id", invoiceId)]);
  if (paymentId) attempts.push(["journal_entries_payment", supabaseAdmin.from("journal_entries").delete().eq("organization_id", organizationId).eq("entity_id", entityId).eq("source_document_id", paymentId)]);
  if (invoiceId) attempts.push(["customer_invoices", supabaseAdmin.from("customer_invoices").delete().eq("organization_id", organizationId).eq("entity_id", entityId).eq("id", invoiceId)]);
  if (partyId) attempts.push(["parties", supabaseAdmin.from("parties").delete().eq("organization_id", organizationId).eq("id", partyId)]);
  for (const [label, query] of attempts) {
    const result = await query;
    if (result.error && !["42P01", "42703"].includes(result.error.code)) console.error(`${CONTRACT}_CLEANUP_WARNING:${label}:${result.error.code}`);
  }
}

let failure = null;
try {
  const context = await selectLocalFinanceContext();
  fixture.organizationId = context.organizationId;
  fixture.entityId = context.entityId;
  const partyId = randomUUID();
  fixture.partyId = partyId;
  await one(
    supabaseAdmin.from("parties").insert({ id: partyId, organization_id: context.organizationId, display_name: `BP Finance Cert ${runId}`, party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true, certification_run_id: runId } }).select("id").single(),
    "PARTY_INSERT_FAILED",
  );

  const postingDate = new Date().toISOString().slice(0, 10);
  const currency = text(context.entity.currency || context.bank.currency_code || context.bank.currency || "THB").toUpperCase();
  const created = await createCustomerInvoiceCommand({
    organization_id: context.organizationId,
    entity_id: context.entityId,
    period_id: context.period.id,
    party_id: partyId,
    invoice_date: postingDate,
    due_date: postingDate,
    currency_code: currency,
    exchange_rate: currency === "THB" ? 1 : null,
    lines: [{ description: tag, quantity: 1, unit_price: 123.45, discount_amount: 0, tax_amount: 0 }],
    notes: tag,
    created_by: text(context.actor.auth_user_id) || null,
    idempotency_key: `bp-finance-cert-invoice:${runId}`,
  });
  let invoiceId = text(created?.invoice_id || created?.invoiceId || created?.id);
  if (!invoiceId) {
    const invoice = await one(supabaseAdmin.from("customer_invoices").select("id").eq("organization_id", context.organizationId).eq("entity_id", context.entityId).eq("party_id", partyId).eq("notes", tag).maybeSingle(), "INVOICE_LOOKUP_FAILED");
    invoiceId = text(invoice?.id);
  }
  assert.ok(invoiceId, "invoice id required");
  fixture.invoiceId = invoiceId;
  const receipt = await receiptModule.execute({
    context: {
      organizationId: context.organizationId,
      entityId: context.entityId,
      periodId: context.period.id,
      actor: { id: text(context.actor.auth_user_id) },
      metadata: { localCertification: true, certificationRunId: runId },
    },
    payload: {
      customer_invoice_id: invoiceId,
      payment_date: postingDate,
      bank_account_id: context.bank.id,
      payment_method: "BANK_TRANSFER",
      reference_number: tag,
    },
  });

  fixture.paymentId = text(receipt?.payment_id || receipt?.id || receipt?.data?.payment_id);
  const verified = await one(
    supabaseAdmin.from("customer_invoices").select("id,invoice_number,status,outstanding_balance,outstanding_amount,total_amount,currency_code,journal_entry_id").eq("organization_id", context.organizationId).eq("entity_id", context.entityId).eq("id", invoiceId).maybeSingle(),
    "INVOICE_VERIFY_FAILED",
  );
  assert.equal(text(verified?.status).toUpperCase(), "PAID");
  assert.ok(Number(verified?.outstanding_balance ?? verified?.outstanding_amount ?? 0) <= 0.005);
  assert.equal(receipt?.receipt_verification?.verified, true);
  assert.ok(Array.isArray(receipt?.artifacts) && receipt.artifacts.some((item) => text(item?.url).includes("mode=receipt")));

  console.log(JSON.stringify({
    contract: CONTRACT,
    status: "CERTIFIED",
    certified: true,
    run_id: runId,
    organization_id: context.organizationId,
    entity_id: context.entityId,
    invoice_id: invoiceId,
    payment_id: fixture.paymentId || null,
    paid_state_verified: true,
    paid_receipt_artifact_verified: true,
    production_writes_performed: false,
    production_deploy_performed: false,
    database_migrations_applied: false,
    local_database_only: true,
  }, null, 2));
} catch (error) {
  failure = error;
} finally {
  await cleanup();
}
if (failure) throw failure;
