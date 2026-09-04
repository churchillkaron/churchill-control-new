export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function accountName(account) {
  return account?.account_name || account?.bank_name || null;
}

async function loadBankAccounts({ organizationId, ids }) {
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("bank_accounts")
    .select("id, bank_name, account_name, account_number, currency, currency_code")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw error;
  return new Map((data || []).map(row => [row.id, row]));
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId =
      searchParams.get("organizationId") || searchParams.get("organization_id");
    const entityId = searchParams.get("entityId") || searchParams.get("entity_id");
    const statementImportId =
      searchParams.get("statementImportId") || searchParams.get("statement_import_id") || null;

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await requireFinanceWorkspacePermission({
      capabilityId: "bank_statements",
      operation: "read",
      access,
    });

    if (!entityId) {
      return NextResponse.json(
        { success: false, error: "entity_id required" },
        { status: 400 }
      );
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

    if (statementImportId) {
      const { data: statement, error: statementError } = await supabaseAdmin
        .from("finance_bank_statement_imports")
        .select("*")
        .eq("organization_id", access.organizationId)
        .eq("entity_id", entity.id)
        .eq("id", statementImportId)
        .maybeSingle();
      if (statementError) throw statementError;
      if (!statement) {
        return NextResponse.json(
          { success: false, error: "Bank statement import not found" },
          { status: 404 }
        );
      }

      const offset = positiveInteger(searchParams.get("lineOffset"), 0, 1000000);
      const limit = Math.max(1, positiveInteger(searchParams.get("lineLimit"), 100, 500));
      const to = offset + limit - 1;

      const [lineResult, totalResult, matchedResult] = await Promise.all([
        supabaseAdmin
          .from("bank_statements")
          .select("id, statement_import_id, statement_line_number, transaction_date, description, amount, direction, reference_number, matched, matched_at, ledger_reference_id, period_id, bank_account_id")
          .eq("organization_id", access.organizationId)
          .eq("entity_id", entity.id)
          .eq("statement_import_id", statement.id)
          .order("statement_line_number", { ascending: true })
          .range(offset, to),
        supabaseAdmin
          .from("bank_statements")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", access.organizationId)
          .eq("entity_id", entity.id)
          .eq("statement_import_id", statement.id),
        supabaseAdmin
          .from("bank_statements")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", access.organizationId)
          .eq("entity_id", entity.id)
          .eq("statement_import_id", statement.id)
          .eq("matched", true),
      ]);

      if (lineResult.error) throw lineResult.error;
      if (totalResult.error) throw totalResult.error;
      if (matchedResult.error) throw matchedResult.error;

      const accountMap = await loadBankAccounts({
        organizationId: access.organizationId,
        ids: unique([statement.bank_account_id]),
      });
      const account = accountMap.get(statement.bank_account_id) || null;
      const total = totalResult.count || 0;
      const matched = matchedResult.count || 0;

      return NextResponse.json({
        success: true,
        statement: {
          ...statement,
          bank_account_name: accountName(account),
          bank_name: account?.bank_name || null,
          bank_account_number: account?.account_number || null,
        },
        lines: lineResult.data || [],
        line_count: total,
        matched_count: matched,
        unmatched_count: Math.max(0, total - matched),
        pagination: {
          offset,
          limit,
          has_more: offset + (lineResult.data || []).length < total,
        },
      });
    }

    const { data, error } = await supabaseAdmin
      .from("finance_bank_statement_imports")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entity.id)
      .order("statement_end_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(250);
    if (error) throw error;

    const rows = data || [];
    const accountMap = await loadBankAccounts({
      organizationId: access.organizationId,
      ids: unique(rows.map(row => row.bank_account_id)),
    });

    return NextResponse.json({
      success: true,
      rows: rows.map(row => {
        const account = accountMap.get(row.bank_account_id) || null;
        return {
          ...row,
          bank_account_name: accountName(account),
          bank_name: account?.bank_name || null,
          bank_account_number: account?.account_number || null,
        };
      }),
    });
  } catch (error) {
    const message = error?.message || "Bank statement load failed";
    const status = /permission denied/i.test(message)
      ? 403
      : /required|not found/i.test(message)
        ? 400
        : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
