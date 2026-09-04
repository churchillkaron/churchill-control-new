export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { financeGateway } from "@/lib/finance/runtime/financeGateway";
import {
  evaluateFinanceVatSettlement,
  financeVatCashJournalLines,
  financeVatSettlementJournalLines,
  financeVatSettlementTarget,
  mergeFinanceVatSettlementMetadata,
  normalizeFinanceVatSettlement,
} from "@/lib/finance/tax/FinanceVatSettlementPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const BANK_MATCH_WINDOW_DAYS = 14;

function clean(value) {
  return String(value ?? "").trim();
}

function required(value, field) {
  const normalized = clean(value);
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function positiveMoney(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${field} must be positive`);
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function statusFor(message) {
  const value = String(message || "");
  if (/permission denied|authentication|membership/i.test(value)) return 403;
  if (/required|positive|scope|submitted|settlement|account|bank|amount|direction|reconciled|configuration|liability|posting date|accounting period|reason|operation/i.test(value)) return 400;
  return 500;
}

function offsetDate(value, days) {
  const parsed = new Date(`${String(value || "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

async function loadReturn({ organizationId, entityId, vatReturnId }) {
  const { data, error } = await supabaseAdmin.from("finance_vat_returns").select("*")
    .eq("organization_id", organizationId).eq("entity_id", entityId).eq("id", vatReturnId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("VAT return not found in organization and entity scope");
  return data;
}

async function loadConfiguration({ organizationId, entityId }) {
  const { data, error } = await supabaseAdmin.from("finance_tax_close_configurations").select("*")
    .eq("organization_id", organizationId).eq("entity_id", entityId).ilike("tax_type", "VAT").maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function loadAccounts({ organizationId, entityId }) {
  const { data, error } = await supabaseAdmin.from("chart_of_accounts")
    .select("id,account_code,account_name,account_category,account_type,currency_code,is_active")
    .eq("organization_id", organizationId).eq("entity_id", entityId).eq("is_active", true)
    .order("account_code", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

async function loadBankAccounts({ organizationId, entityId }) {
  const { data, error } = await supabaseAdmin.from("bank_accounts")
    .select("id,bank_name,account_name,account_number,currency_code,currency,finance_account_id,is_default,active")
    .eq("organization_id", organizationId).eq("entity_id", entityId).eq("active", true)
    .order("is_default", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

async function loadLiabilityPostingControl({ organizationId, entityId, vatReturn }) {
  const defaultPostingDate = clean(vatReturn?.period_end) || null;
  if (!defaultPostingDate) {
    return {
      default_posting_date: null,
      default_period: null,
      default_period_open: false,
      alternate_date_requires_reason: true,
    };
  }
  const { data, error } = await supabaseAdmin.from("accounting_periods")
    .select("id,status,start_date,end_date,period_name,period_number")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .lte("start_date", defaultPostingDate)
    .gte("end_date", defaultPostingDate)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const status = String(data?.status || "").toLowerCase();
  return {
    default_posting_date: defaultPostingDate,
    default_period: data || null,
    default_period_open: status === "open" || status === "active",
    alternate_date_requires_reason: true,
  };
}

async function loadSettlementEvidence({ organizationId, entityId, vatReturn }) {
  const settlement = normalizeFinanceVatSettlement(vatReturn);
  const journalIds = [...settlement.liability_events.map(row => row.journal_entry_id), ...settlement.cash_events.map(row => row.journal_entry_id)].filter(Boolean);
  const bankIds = settlement.cash_events.map(row => row.bank_transaction_id).filter(Boolean);
  const [journalResult, bankResult] = await Promise.all([
    journalIds.length ? supabaseAdmin.from("journal_entries").select("*").eq("organization_id", organizationId).eq("entity_id", entityId).in("id", journalIds) : Promise.resolve({ data: [], error: null }),
    bankIds.length ? supabaseAdmin.from("bank_transactions").select("*").eq("organization_id", organizationId).eq("entity_id", entityId).in("id", bankIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (journalResult.error) throw new Error(journalResult.error.message);
  if (bankResult.error) throw new Error(bankResult.error.message);
  return { journalRows: journalResult.data || [], bankTransactionRows: bankResult.data || [] };
}

async function loadBankMatchCandidates({ organizationId, entityId, cashEvents }) {
  const result = {};
  for (const event of cashEvents || []) {
    if (event.bank_transaction_id || !event.bank_account_id || !event.payment_date || !event.journal_valid) continue;
    const start = offsetDate(event.payment_date, -BANK_MATCH_WINDOW_DAYS);
    const end = offsetDate(event.payment_date, BANK_MATCH_WINDOW_DAYS);
    if (!start || !end) continue;
    const { data, error } = await supabaseAdmin.from("bank_transactions")
      .select("id,bank_account_id,transaction_date,description,reference,amount,type,reconciled")
      .eq("organization_id", organizationId).eq("entity_id", entityId).eq("bank_account_id", event.bank_account_id)
      .gte("transaction_date", start).lte("transaction_date", end).order("transaction_date", { ascending: true });
    if (error) throw new Error(error.message);
    result[event.id] = (data || []).filter(row => Math.abs(Math.abs(Number(row.amount || 0)) - Number(event.amount || 0)) <= 0.005);
  }
  return result;
}

async function buildSettlementView({ organizationId, entityId, vatReturn }) {
  const [configuration, accounts, bankAccounts, evidence, liabilityPostingControl] = await Promise.all([
    loadConfiguration({ organizationId, entityId }),
    loadAccounts({ organizationId, entityId }),
    loadBankAccounts({ organizationId, entityId }),
    loadSettlementEvidence({ organizationId, entityId, vatReturn }),
    loadLiabilityPostingControl({ organizationId, entityId, vatReturn }),
  ]);
  const settlement = evaluateFinanceVatSettlement({ vatReturn, configuration, journalRows: evidence.journalRows, bankTransactionRows: evidence.bankTransactionRows });
  const bankMatchCandidates = await loadBankMatchCandidates({ organizationId, entityId, cashEvents: settlement.cash_events });
  return { configuration, accounts, bank_accounts: bankAccounts, bank_match_candidates: bankMatchCandidates, liability_posting_control: liabilityPostingControl, settlement };
}

async function persistSettlement({ vatReturn, settlement }) {
  const now = new Date().toISOString();
  let query = supabaseAdmin.from("finance_vat_returns")
    .update({ metadata: mergeFinanceVatSettlementMetadata(vatReturn, settlement), updated_at: now })
    .eq("id", vatReturn.id).eq("organization_id", vatReturn.organization_id).eq("entity_id", vatReturn.entity_id);
  if (vatReturn.updated_at) query = query.eq("updated_at", vatReturn.updated_at);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("VAT settlement changed by another user; refresh before continuing");
  return data;
}

async function verifyAccount({ organizationId, entityId, accountId, label }) {
  const { data, error } = await supabaseAdmin.from("chart_of_accounts").select("id")
    .eq("id", accountId).eq("organization_id", organizationId).eq("entity_id", entityId).eq("is_active", true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${label} is outside organization/entity scope or inactive`);
}

async function requireJournalPostingPermission(access) {
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.journals.post",
    fullAccess: access.permissions?.includes("*") === true,
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({ organizationId: searchParams.get("organizationId") || searchParams.get("organization_id"), request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    await requireFinanceWorkspacePermission({ capabilityId: "vat_returns", operation: "read", access });
    const entityId = required(searchParams.get("entityId") || searchParams.get("entity_id"), "entity_id");
    const vatReturnId = required(searchParams.get("vatReturnId") || searchParams.get("vat_return_id"), "vat_return_id");
    const vatReturn = await loadReturn({ organizationId: access.organizationId, entityId, vatReturnId });
    const view = await buildSettlementView({ organizationId: access.organizationId, entityId, vatReturn });
    return NextResponse.json({ success: true, return: vatReturn, ...view });
  } catch (error) {
    const message = error?.message || "VAT settlement could not be loaded";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({ organizationId: body.organizationId || body.organization_id, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    await requireFinanceWorkspacePermission({ capabilityId: "vat_returns", operation: "write", access });
    const entityId = required(body.entityId || body.entity_id, "entity_id");
    const recoverable = required(body.recoverableTaxAccountId || body.recoverable_tax_account_id, "recoverable_tax_account_id");
    const payable = required(body.payableTaxAccountId || body.payable_tax_account_id, "payable_tax_account_id");
    const settlementAccount = required(body.settlementAccountId || body.settlement_account_id, "settlement_account_id");
    if (new Set([recoverable, payable, settlementAccount]).size !== 3) throw new Error("Tax close accounts must be three distinct accounts");
    await Promise.all([
      verifyAccount({ organizationId: access.organizationId, entityId, accountId: recoverable, label: "Recoverable VAT account" }),
      verifyAccount({ organizationId: access.organizationId, entityId, accountId: payable, label: "Payable VAT account" }),
      verifyAccount({ organizationId: access.organizationId, entityId, accountId: settlementAccount, label: "Tax settlement account" }),
    ]);
    const existing = await loadConfiguration({ organizationId: access.organizationId, entityId });
    const record = { organization_id: access.organizationId, entity_id: entityId, tax_type: "VAT", recoverable_tax_account_id: recoverable, payable_tax_account_id: payable, settlement_account_id: settlementAccount, status: "ACTIVE", updated_at: new Date().toISOString() };
    const write = existing
      ? supabaseAdmin.from("finance_tax_close_configurations").update(record).eq("id", existing.id).eq("organization_id", access.organizationId).eq("entity_id", entityId)
      : supabaseAdmin.from("finance_tax_close_configurations").insert({ ...record, created_at: new Date().toISOString() });
    const { data, error } = await write.select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, configuration: data });
  } catch (error) {
    const message = error?.message || "VAT settlement configuration could not be saved";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({ organizationId: body.organizationId || body.organization_id, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    await requireFinanceWorkspacePermission({ capabilityId: "vat_returns", operation: "write", access });
    const actorId = required(access.user?.id, "authenticated user");
    const entityId = required(body.entityId || body.entity_id, "entity_id");
    const vatReturnId = required(body.vatReturnId || body.vat_return_id, "vat_return_id");
    const action = required(body.action, "action").toLowerCase();
    const vatReturn = await loadReturn({ organizationId: access.organizationId, entityId, vatReturnId });
    if (String(vatReturn.status || "").toUpperCase() !== "SUBMITTED") throw new Error("VAT return must be submitted before liability settlement begins");
    const configuration = await loadConfiguration({ organizationId: access.organizationId, entityId });
    if (!configuration?.recoverable_tax_account_id || !configuration?.payable_tax_account_id || !configuration?.settlement_account_id) throw new Error("VAT settlement configuration is incomplete");
    const currentView = await buildSettlementView({ organizationId: access.organizationId, entityId, vatReturn });
    const settlement = normalizeFinanceVatSettlement(vatReturn);
    const target = financeVatSettlementTarget(vatReturn);

    if (action === "post_liability") {
      await requireJournalPostingPermission(access);
      if (currentView.settlement.target_recognized) throw new Error("Current filed VAT version is already posted to settlement control");
      const lines = financeVatSettlementJournalLines({ delta: currentView.settlement.liability_delta, configuration });
      const zeroValue = lines.length === 0;
      const defaultPostingDate = required(vatReturn.period_end, "VAT period end");
      const postingDate = clean(body.postingDate || body.posting_date) || defaultPostingDate;
      const alternatePostingDate = postingDate !== defaultPostingDate;
      const postingDateReason = clean(body.postingDateReason || body.posting_date_reason);
      if (alternatePostingDate && !postingDateReason) throw new Error("Alternate VAT liability posting date requires a reason");
      let journalId = null;
      let journalNumber = null;
      if (!zeroValue) {
        const result = await financeGateway({ type: "DIRECT_JOURNAL_POST", payload: {
          organizationId: access.organizationId, entityId, postingDate, documentDate: postingDate,
          journalType: "TAX_SETTLEMENT", reference: target.submission_reference || target.label,
          sourceModule: "FINANCE_TAX", sourceDocument: "VAT_RETURN_SETTLEMENT", sourceDocumentId: vatReturn.id,
          description: `${target.label} VAT close into tax settlement control`, currencyCode: target.values.currency_code || vatReturn.currency_code || "THB",
          exchangeRate: 1, lines, createdBy: actorId, idempotencyKey: `vat-settlement-liability:${vatReturn.id}:${target.key}`,
        } });
        journalId = result?.journal?.id || result?.journalEntryId || result?.ledger?.journalEntryId || null;
        journalNumber = result?.journal?.journal_number || result?.journal?.entry_number || null;
        if (!journalId) throw new Error("VAT liability journal did not return a journal entry id");
      }
      settlement.liability_events = [...settlement.liability_events, {
        id: randomUUID(),
        source_version_key: target.key,
        source_version_label: target.label,
        snapshot_before: currentView.settlement.recognized_snapshot,
        snapshot_after: target.values,
        delta: currentView.settlement.liability_delta,
        journal_entry_id: journalId,
        journal_number: journalNumber,
        zero_value: zeroValue,
        posting_date: postingDate,
        default_posting_date: defaultPostingDate,
        alternate_posting_date: alternatePostingDate,
        posting_date_reason: alternatePostingDate ? postingDateReason : null,
        posted_at: new Date().toISOString(),
        posted_by: actorId,
      }];
      const updated = await persistSettlement({ vatReturn, settlement });
      return NextResponse.json({ success: true, return: updated, ...(await buildSettlementView({ organizationId: access.organizationId, entityId, vatReturn: updated })) });
    }

    if (action === "record_cash") {
      await requireJournalPostingPermission(access);
      const operationId = required(body.operationId || body.operation_id, "operation_id");
      if (operationId.length > 128) throw new Error("operation_id is too long");
      const existingCashEvent = settlement.cash_events.find(row => clean(row.operation_id || row.id) === operationId);
      if (existingCashEvent) {
        return NextResponse.json({
          success: true,
          idempotent_replay: true,
          return: vatReturn,
          ...(await buildSettlementView({ organizationId: access.organizationId, entityId, vatReturn })),
        });
      }
      if (!currentView.settlement.target_recognized) throw new Error("Post the current VAT liability before recording payment or refund");
      const expectedDirection = currentView.settlement.expected_direction;
      if (!expectedDirection) throw new Error("VAT settlement has no outstanding payment or refund balance");
      const direction = required(body.direction, "direction").toUpperCase();
      if (direction !== expectedDirection) throw new Error(`VAT settlement expects a ${expectedDirection.toLowerCase()}, not ${direction.toLowerCase()}`);
      const amount = positiveMoney(body.amount, "amount");
      if (amount - currentView.settlement.amount_remaining > 0.005) throw new Error("Settlement cash amount exceeds the outstanding VAT balance");
      const bankAccountId = required(body.bankAccountId || body.bank_account_id, "bank_account_id");
      const { data: bankAccount, error: bankAccountError } = await supabaseAdmin.from("bank_accounts").select("*").eq("id", bankAccountId).eq("organization_id", access.organizationId).eq("entity_id", entityId).eq("active", true).maybeSingle();
      if (bankAccountError) throw new Error(bankAccountError.message);
      if (!bankAccount?.finance_account_id) throw new Error("Selected bank account is not mapped to a Finance GL account");
      await verifyAccount({ organizationId: access.organizationId, entityId, accountId: bankAccount.finance_account_id, label: "Bank GL account" });
      const paymentDate = required(body.paymentDate || body.payment_date, "payment_date");
      const reference = required(body.reference, "payment/refund reference");
      const lines = financeVatCashJournalLines({ direction, amount, settlementAccountId: configuration.settlement_account_id, bankAccountId: bankAccount.finance_account_id });
      const result = await financeGateway({ type: "DIRECT_JOURNAL_POST", payload: {
        organizationId: access.organizationId, entityId, postingDate: paymentDate, documentDate: paymentDate,
        journalType: "TAX_PAYMENT", reference, sourceModule: "FINANCE_TAX",
        sourceDocument: direction === "PAYMENT" ? "VAT_PAYMENT" : "VAT_REFUND", sourceDocumentId: vatReturn.id,
        description: direction === "PAYMENT" ? "VAT payment to tax authority" : "VAT refund received from tax authority",
        currencyCode: currentView.settlement.currency_code, exchangeRate: 1, lines, createdBy: actorId,
        idempotencyKey: `vat-settlement-cash:${vatReturn.id}:${operationId}`,
      } });
      const journalId = result?.journal?.id || result?.journalEntryId || result?.ledger?.journalEntryId || null;
      if (!journalId) throw new Error("VAT cash journal did not return a journal entry id");
      settlement.cash_events = [...settlement.cash_events, {
        id: operationId,
        operation_id: operationId,
        direction,
        amount,
        currency_code: currentView.settlement.currency_code,
        payment_date: paymentDate,
        reference,
        bank_account_id: bankAccount.id,
        bank_finance_account_id: bankAccount.finance_account_id,
        journal_entry_id: journalId,
        journal_number: result?.journal?.journal_number || result?.journal?.entry_number || null,
        bank_transaction_id: null,
        recorded_at: new Date().toISOString(),
        recorded_by: actorId,
      }];
      const updated = await persistSettlement({ vatReturn, settlement });
      return NextResponse.json({ success: true, idempotent_replay: result?.ledger?.idempotentReplay === true, return: updated, ...(await buildSettlementView({ organizationId: access.organizationId, entityId, vatReturn: updated })) });
    }

    if (action === "link_bank_transaction") {
      const cashEventId = required(body.cashEventId || body.cash_event_id, "cash_event_id");
      const bankTransactionId = required(body.bankTransactionId || body.bank_transaction_id, "bank_transaction_id");
      const index = settlement.cash_events.findIndex(row => row.id === cashEventId);
      if (index < 0) throw new Error("VAT cash settlement event not found");
      const cashEvent = settlement.cash_events[index];
      const { data: bankTransaction, error: bankError } = await supabaseAdmin.from("bank_transactions").select("*").eq("id", bankTransactionId).eq("organization_id", access.organizationId).eq("entity_id", entityId).maybeSingle();
      if (bankError) throw new Error(bankError.message);
      if (!bankTransaction) throw new Error("Bank transaction not found in organization/entity scope");
      if (cashEvent.bank_account_id && bankTransaction.bank_account_id && cashEvent.bank_account_id !== bankTransaction.bank_account_id) throw new Error("Bank transaction belongs to a different bank account");
      if (Math.abs(Math.abs(Number(bankTransaction.amount || 0)) - Number(cashEvent.amount || 0)) > 0.005) throw new Error("Bank transaction amount does not match the VAT cash settlement event");
      settlement.cash_events[index] = { ...cashEvent, bank_transaction_id: bankTransaction.id, bank_linked_at: new Date().toISOString(), bank_linked_by: actorId };
      const updated = await persistSettlement({ vatReturn, settlement });
      return NextResponse.json({ success: true, return: updated, ...(await buildSettlementView({ organizationId: access.organizationId, entityId, vatReturn: updated })) });
    }

    throw new Error(`Unsupported VAT settlement action: ${action}`);
  } catch (error) {
    const message = error?.message || "VAT settlement action failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}