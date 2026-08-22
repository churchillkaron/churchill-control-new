export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function number(value, field) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) throw new Error(`${field} must be a valid number`);
  return resolved;
}

function dateOnly(value, field) {
  const candidate = value ? new Date(value) : null;
  if (!candidate || Number.isNaN(candidate.getTime())) throw new Error(`${field} required`);
  return candidate.toISOString().slice(0, 10);
}

function statusFor(message) {
  if (/permission denied/i.test(message || "")) return 403;
  return /required|not found|valid|inactive|entity|account/i.test(message || "") ? 400 : 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.banking.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const entityId = body.entity_id || body.entityId;
    const bankAccountId = body.bank_account_id || body.bankAccountId;
    const reconciliationDate = dateOnly(
      body.reconciliation_date || body.reconciliationDate,
      "reconciliation_date"
    );
    const statementClosingBalance = number(
      body.statement_closing_balance ?? body.statementClosingBalance,
      "statement_closing_balance"
    );

    if (!entityId) throw new Error("entity_id required");
    if (!bankAccountId) throw new Error("bank_account_id required");

    const { data: bankAccount, error: accountError } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, entity_id, finance_account_id, active, account_name, bank_name, currency_code, currency")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entityId)
      .eq("id", bankAccountId)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!bankAccount) throw new Error("Bank account not found in selected legal entity");
    if (bankAccount.active === false) throw new Error("Bank account is inactive");
    if (!bankAccount.finance_account_id) {
      throw new Error("Bank account must be linked to a Finance GL account before reconciliation");
    }

    const { data: lines, error: linesError } = await supabaseAdmin
      .from("journal_entry_lines")
      .select("debit,credit,journal_entries!inner(organization_id,entity_id,posting_date,status)")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entityId)
      .eq("account_id", bankAccount.finance_account_id)
      .eq("journal_entries.organization_id", access.organizationId)
      .eq("journal_entries.entity_id", entityId)
      .lte("journal_entries.posting_date", reconciliationDate)
      .in("journal_entries.status", ["POSTED", "posted"]);
    if (linesError) throw linesError;

    const bookClosingBalance = Number(
      (lines || []).reduce(
        (sum, line) => sum + Number(line.debit || 0) - Number(line.credit || 0),
        0
      ).toFixed(2)
    );
    const differenceAmount = Number((statementClosingBalance - bookClosingBalance).toFixed(2));
    const matched = Math.abs(differenceAmount) < 0.005;

    const record = {
      organization_id: access.organizationId,
      entity_id: entityId,
      bank_account_id: bankAccountId,
      bank_statement_id: body.bank_statement_id || body.bankStatementId || null,
      reconciliation_date: reconciliationDate,
      book_closing_balance: bookClosingBalance,
      statement_closing_balance: statementClosingBalance,
      difference_amount: differenceAmount,
      notes: body.notes || null,
      status: matched ? "RECONCILED" : "OPEN",
      created_by: access.user?.id || null,
      updated_at: new Date().toISOString(),
    };

    const { data: run, error: runError } = await supabaseAdmin
      .from("finance_bank_reconciliation_runs")
      .insert(record)
      .select("*")
      .single();
    if (runError) throw runError;

    return NextResponse.json({
      success: true,
      reconciliation: run,
      bank_account: {
        id: bankAccount.id,
        name: bankAccount.account_name || bankAccount.bank_name || "Bank Account",
        currency_code: bankAccount.currency_code || bankAccount.currency || null,
      },
      matched,
    });
  } catch (error) {
    const message = error?.message || "Bank reconciliation failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
