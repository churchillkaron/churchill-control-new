export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PAGE_SIZE = 1000;
const RECEIVABLE_EXCLUDED = new Set([
  "DRAFT",
  "CANCELLED",
  "CANCELED",
  "VOID",
  "PAID",
  "CREDITED",
  "POSTING_FAILED",
]);
const PAYABLE_EXCLUDED = new Set([
  "PAID",
  "CANCELLED",
  "CANCELED",
  "VOID",
  "REJECTED",
]);

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : 0;
}

function currency(value) {
  return text(value).toUpperCase() || "UNSPECIFIED";
}

function isoDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function addDays(dateText, days) {
  const parsed = new Date(`${dateText}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function daysBetween(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const from = new Date(`${fromDate}T00:00:00.000Z`).getTime();
  const to = new Date(`${toDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.floor((to - from) / 86400000));
}

async function fetchPaged(buildQuery) {
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

function signedBankMovement(row) {
  const amount = Math.abs(number(row?.amount));
  const direction = text(row?.direction).toUpperCase();
  if (["IN", "CREDIT", "RECEIPT", "DEPOSIT"].includes(direction)) return amount;
  if (["OUT", "DEBIT", "PAYMENT", "WITHDRAWAL"].includes(direction)) return -amount;
  return 0;
}

function dueBucket(dueDate, today, day7, day30) {
  const due = isoDate(dueDate);
  if (!due) return "unscheduled";
  if (due < today) return "overdue";
  if (due <= day7) return "due_7d";
  if (due <= day30) return "due_30d";
  return "later";
}

function emptyFlow(currencyCode) {
  return {
    currency_code: currencyCode,
    bank_position: 0,
    known_bank_accounts: 0,
    unknown_bank_accounts: 0,
    overdue_receipts: 0,
    due_7d_receipts: 0,
    due_30d_receipts: 0,
    later_receipts: 0,
    unscheduled_receipts: 0,
    overdue_payments: 0,
    due_7d_payments: 0,
    due_30d_payments: 0,
    later_payments: 0,
    unscheduled_payments: 0,
    held_payments: 0,
    scheduled_position_7d: null,
    scheduled_position_30d: null,
  };
}

function flowFor(map, currencyCode) {
  const key = currency(currencyCode);
  if (!map.has(key)) map.set(key, emptyFlow(key));
  return map.get(key);
}

function compactReceivable(row) {
  const outstanding = number(row?.outstanding_amount ?? row?.outstanding_balance ?? row?.total_amount);
  return {
    id: row?.id,
    document_number: row?.invoice_number || null,
    due_date: row?.due_date || null,
    currency_code: currency(row?.currency_code),
    outstanding_amount: outstanding,
    status: row?.status || null,
  };
}

function compactPayable(row) {
  return {
    id: row?.id,
    due_date: row?.due_date || null,
    currency_code: currency(row?.currency_code),
    outstanding_amount: number(row?.outstanding_balance ?? row?.amount),
    status: row?.status || null,
    payment_hold: row?.payment_hold === true,
    hold_reason: row?.hold_reason || null,
    vendor_invoice_id: row?.vendor_invoice_id || null,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId") || searchParams.get("organization_id");
    const entityId = searchParams.get("entityId") || searchParams.get("entity_id");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    await requireFinanceWorkspacePermission({
      capabilityId: "cash_management",
      operation: "read",
      access,
    });

    if (!entityId) {
      return NextResponse.json({ success: false, error: "entity_id required" }, { status: 400 });
    }

    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId,
    });
    if (!entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity not found in organisation" },
        { status: 404 }
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const day7 = addDays(today, 7);
    const day30 = addDays(today, 30);

    const [bankAccountResult, statementRows, receivableRows, payableRows] = await Promise.all([
      supabaseAdmin
        .from("bank_accounts")
        .select("id, bank_name, account_name, account_number, currency, currency_code, account_type, active, is_default, finance_account_id")
        .eq("organization_id", access.organizationId)
        .eq("entity_id", entity.id)
        .eq("active", true)
        .order("is_default", { ascending: false })
        .order("account_name", { ascending: true }),
      fetchPaged((from, to) =>
        supabaseAdmin
          .from("finance_bank_statement_imports")
          .select("id, bank_account_id, statement_number, statement_start_date, statement_end_date, opening_balance, closing_balance, currency_code, status, created_at")
          .eq("organization_id", access.organizationId)
          .eq("entity_id", entity.id)
          .order("statement_end_date", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, to)
      ),
      fetchPaged((from, to) =>
        supabaseAdmin
          .from("customer_invoices")
          .select("id, invoice_number, due_date, outstanding_balance, outstanding_amount, total_amount, currency_code, status")
          .eq("organization_id", access.organizationId)
          .eq("entity_id", entity.id)
          .range(from, to)
      ),
      fetchPaged((from, to) =>
        supabaseAdmin
          .from("accounts_payable")
          .select("id, vendor_invoice_id, due_date, outstanding_balance, amount, currency_code, status, payment_hold, hold_reason")
          .eq("organization_id", access.organizationId)
          .eq("entity_id", entity.id)
          .range(from, to)
      ),
    ]);

    if (bankAccountResult.error) throw bankAccountResult.error;
    const bankAccounts = bankAccountResult.data || [];

    const latestStatementByAccount = new Map();
    for (const statement of statementRows) {
      if (!latestStatementByAccount.has(statement.bank_account_id)) {
        latestStatementByAccount.set(statement.bank_account_id, statement);
      }
    }

    const accountsWithoutStatement = bankAccounts.some(account => !latestStatementByAccount.has(account.id));
    const statementDates = bankAccounts
      .map(account => latestStatementByAccount.get(account.id)?.statement_end_date)
      .filter(Boolean)
      .sort();
    const earliestStatementDate = statementDates[0] || null;

    const ledgerRows = await fetchPaged((from, to) => {
      let query = supabaseAdmin
        .from("bank_ledger")
        .select("id, bank_account_id, transaction_type, amount, direction, created_at, reconciled_statement_id, reconciled_at, currency_code, reference_number, source_document, source_document_id")
        .eq("organization_id", access.organizationId)
        .eq("entity_id", entity.id)
        .order("created_at", { ascending: true });
      if (!accountsWithoutStatement && earliestStatementDate) {
        query = query.gte("created_at", `${earliestStatementDate}T00:00:00.000Z`);
      }
      return query.range(from, to);
    });

    const ledgerByAccount = new Map();
    for (const row of ledgerRows) {
      if (!row.bank_account_id) continue;
      if (!ledgerByAccount.has(row.bank_account_id)) ledgerByAccount.set(row.bank_account_id, []);
      ledgerByAccount.get(row.bank_account_id).push(row);
    }

    const flows = new Map();
    const accounts = bankAccounts.map(account => {
      const statement = latestStatementByAccount.get(account.id) || null;
      const accountLedger = ledgerByAccount.get(account.id) || [];
      const statementEndDate = statement?.statement_end_date || null;
      const cutoff = statementEndDate ? new Date(`${statementEndDate}T23:59:59.999Z`).getTime() : null;
      const postStatementRows = accountLedger.filter(row => {
        if (cutoff === null) return true;
        const created = new Date(row.created_at).getTime();
        return Number.isFinite(created) && created > cutoff;
      });
      const postStatementNet = postStatementRows.reduce((sum, row) => sum + signedBankMovement(row), 0);
      const statementBalance = statement ? number(statement.closing_balance) : null;
      const ledgerOnlyNet = accountLedger.reduce((sum, row) => sum + signedBankMovement(row), 0);
      const workingBalance = statement
        ? statementBalance + postStatementNet
        : accountLedger.length
          ? ledgerOnlyNet
          : null;
      const accountCurrency = currency(
        account.currency_code || account.currency || statement?.currency_code
      );
      const freshnessDays = statementEndDate ? daysBetween(statementEndDate, today) : null;
      const positionBasis = statement
        ? postStatementRows.length
          ? "STATEMENT_PLUS_POSTED_ACTIVITY"
          : "STATEMENT"
        : accountLedger.length
          ? "LEDGER_ONLY"
          : "NO_EVIDENCE";
      const freshness = !statement
        ? "NO_BANK_EVIDENCE"
        : freshnessDays <= 2
          ? "CURRENT"
          : freshnessDays <= 7
            ? "AGING"
            : "STALE";
      const unreconciledCount = accountLedger.filter(
        row => !row.reconciled_at && !row.reconciled_statement_id
      ).length;
      const recentMovements = [...accountLedger]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 20)
        .map(row => ({ ...row, signed_amount: signedBankMovement(row) }));

      const flow = flowFor(flows, accountCurrency);
      if (workingBalance === null) {
        flow.unknown_bank_accounts += 1;
      } else {
        flow.known_bank_accounts += 1;
        flow.bank_position += workingBalance;
      }

      return {
        id: account.id,
        bank_name: account.bank_name || null,
        account_name: account.account_name || account.bank_name || "Bank account",
        account_number: account.account_number || null,
        account_type: account.account_type || null,
        currency_code: accountCurrency,
        is_default: account.is_default === true,
        finance_account_id: account.finance_account_id || null,
        latest_statement: statement,
        statement_balance: statementBalance,
        statement_date: statementEndDate,
        statement_age_days: freshnessDays,
        post_statement_net: postStatementNet,
        working_balance: workingBalance,
        position_basis: positionBasis,
        freshness,
        unreconciled_count: unreconciledCount,
        recent_movements: recentMovements,
        last_movement_at: recentMovements[0]?.created_at || null,
      };
    });

    const receivables = receivableRows
      .filter(row => !RECEIVABLE_EXCLUDED.has(text(row.status).toUpperCase()))
      .map(compactReceivable)
      .filter(row => row.outstanding_amount > 0);

    for (const row of receivables) {
      const flow = flowFor(flows, row.currency_code);
      const bucket = dueBucket(row.due_date, today, day7, day30);
      flow[`${bucket}_receipts`] += row.outstanding_amount;
    }

    const payables = payableRows
      .filter(row => !PAYABLE_EXCLUDED.has(text(row.status).toUpperCase()))
      .map(compactPayable)
      .filter(row => row.outstanding_amount > 0);

    for (const row of payables) {
      const flow = flowFor(flows, row.currency_code);
      if (row.payment_hold) {
        flow.held_payments += row.outstanding_amount;
        continue;
      }
      const bucket = dueBucket(row.due_date, today, day7, day30);
      flow[`${bucket}_payments`] += row.outstanding_amount;
    }

    const currencyPositions = [...flows.values()]
      .map(flow => {
        const receipts7 = flow.overdue_receipts + flow.due_7d_receipts;
        const payments7 = flow.overdue_payments + flow.due_7d_payments;
        const receipts30 = receipts7 + flow.due_30d_receipts;
        const payments30 = payments7 + flow.due_30d_payments;
        const hasKnownPosition = flow.known_bank_accounts > 0;
        return {
          ...flow,
          scheduled_position_7d: hasKnownPosition
            ? flow.bank_position + receipts7 - payments7
            : null,
          scheduled_position_30d: hasKnownPosition
            ? flow.bank_position + receipts30 - payments30
            : null,
          incomplete_bank_position: flow.unknown_bank_accounts > 0,
        };
      })
      .sort((a, b) => a.currency_code.localeCompare(b.currency_code));

    const exceptionCounts = {
      stale_bank_evidence: accounts.filter(account => account.freshness === "STALE").length,
      missing_bank_evidence: accounts.filter(account => account.freshness === "NO_BANK_EVIDENCE").length,
      unreconciled_bank_movements: accounts.reduce((sum, account) => sum + account.unreconciled_count, 0),
      overdue_receivables: receivables.filter(row => dueBucket(row.due_date, today, day7, day30) === "overdue").length,
      overdue_payables: payables.filter(row => !row.payment_hold && dueBucket(row.due_date, today, day7, day30) === "overdue").length,
      held_payables: payables.filter(row => row.payment_hold).length,
    };

    return NextResponse.json({
      success: true,
      generated_at: new Date().toISOString(),
      as_of_date: today,
      horizon_7d: day7,
      horizon_30d: day30,
      entity: { id: entity.id, name: entity.legal_name || entity.name || null },
      accounts,
      currency_positions: currencyPositions,
      receivables: receivables
        .sort((a, b) => text(a.due_date).localeCompare(text(b.due_date)))
        .slice(0, 100),
      payables: payables
        .sort((a, b) => text(a.due_date).localeCompare(text(b.due_date)))
        .slice(0, 100),
      exceptions: exceptionCounts,
      methodology: {
        bank_position:
          "Latest imported statement closing balance plus posted bank-ledger activity created after that statement date. Accounts without bank-statement evidence are explicitly marked ledger-only or no-evidence.",
        scheduled_position:
          "Bank position plus currently outstanding receivables minus non-held payables due within the selected horizon. No FX conversion is applied; currencies remain separate.",
      },
    });
  } catch (error) {
    const message = error?.message || "Cash Management load failed";
    const status = /permission denied/i.test(message)
      ? 403
      : /required|not found/i.test(message)
        ? 400
        : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
