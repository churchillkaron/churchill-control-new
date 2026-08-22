export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`${field} required`);
  }
  return value;
}

function dateOnly(value, field) {
  const candidate = String(required(value, field)).trim().slice(0, 10);
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be a valid date`);
  return candidate;
}

function numeric(value, field) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) throw new Error(`${field} must be a valid number`);
  return resolved;
}

function normalizeLines(value) {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value)) throw new Error("lines must be an array");

  return value.map((line, index) => {
    const number = index + 1;
    const transactionDate = dateOnly(line?.transaction_date, `Line ${number} transaction_date`);
    const amount = numeric(line?.amount, `Line ${number} amount`);
    const direction = String(required(line?.direction, `Line ${number} direction`)).trim().toUpperCase();

    if (amount <= 0) throw new Error(`Line ${number} amount must be greater than zero`);
    if (!new Set(["IN", "OUT"]).has(direction)) {
      throw new Error(`Line ${number} direction must be IN or OUT`);
    }

    return {
      transaction_date: transactionDate,
      description: String(line?.description || "").trim() || null,
      amount,
      direction,
      reference_number: String(line?.reference_number || "").trim() || null,
    };
  });
}

function statusFor(message) {
  const normalized = String(message || "");
  if (/permission denied/i.test(normalized)) return 403;
  if (/required|valid|invalid|must|already imported|not found|inactive|currency|outside|array|statement/i.test(normalized)) {
    return 400;
  }
  return 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await requireFinanceWorkspacePermission({
      capabilityId: "bank_statements",
      operation: "write",
      access,
    });

    const entityId = String(required(body.entityId || body.entity_id, "entity_id")).trim();
    const bankAccountId = String(required(body.bank_account_id || body.bankAccountId, "bank_account_id")).trim();
    const statementNumber = String(required(body.statement_number || body.statementNumber, "statement_number")).trim();
    const statementStartDate = dateOnly(
      body.statement_start_date || body.statementStartDate,
      "statement_start_date"
    );
    const statementEndDate = dateOnly(
      body.statement_end_date || body.statementEndDate,
      "statement_end_date"
    );

    if (statementStartDate > statementEndDate) {
      throw new Error("statement_start_date must not be after statement_end_date");
    }

    const openingBalance = numeric(body.opening_balance ?? body.openingBalance, "opening_balance");
    const closingBalance = numeric(body.closing_balance ?? body.closingBalance, "closing_balance");
    const currencyCode = String(required(body.currency_code || body.currencyCode, "currency_code"))
      .trim()
      .toUpperCase();
    const lines = normalizeLines(body.lines);

    for (const [index, line] of lines.entries()) {
      if (line.transaction_date < statementStartDate || line.transaction_date > statementEndDate) {
        throw new Error(`Line ${index + 1} transaction_date is outside the statement period`);
      }
    }

    const { data, error } = await supabaseAdmin.rpc(
      "create_finance_bank_statement_import",
      {
        p_organization_id: access.organizationId,
        p_entity_id: entityId,
        p_bank_account_id: bankAccountId,
        p_statement_number: statementNumber,
        p_statement_start_date: statementStartDate,
        p_statement_end_date: statementEndDate,
        p_opening_balance: openingBalance,
        p_closing_balance: closingBalance,
        p_currency_code: currencyCode,
        p_import_reference:
          String(body.import_reference || body.importReference || "").trim() || null,
        p_created_by: access.user?.id || null,
        p_lines: lines,
      }
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      ...(data && typeof data === "object" ? data : { result: data }),
    });
  } catch (error) {
    const message = error?.message || "Bank statement import failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
