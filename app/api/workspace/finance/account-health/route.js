export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { loadLedgerAccountBalances } from "@/lib/finance/reporting/reports/loadLedgerAccountBalances";
import { buildFinanceAccountHealth } from "@/lib/finance/ui/FinanceAccountHealth";

function clean(value) {
  return String(value ?? "").trim();
}

function dateKey(value) {
  return value ? String(value).slice(0, 10) : null;
}

function earlierDate(left, right) {
  if (!left) return right || null;
  if (!right) return left || null;
  return left <= right ? left : right;
}

function statusFor(message) {
  if (/permission denied/i.test(message || "")) return 403;
  if (/required|context/i.test(message || "")) return 400;
  return 500;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    );
    const entityId = clean(
      url.searchParams.get("entityId") || url.searchParams.get("entity_id"),
    );
    const periodId = clean(
      url.searchParams.get("periodId") || url.searchParams.get("period_id"),
    );

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.accounting.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
      request,
      access,
    });

    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 400 },
      );
    }

    const resolvedEntityId = context.entityId || null;
    const resolvedPeriodId = context.periodId || null;
    const periodStart = dateKey(context.period?.start_date);
    const periodEnd = dateKey(context.period?.end_date);

    if (!resolvedEntityId || !resolvedPeriodId || !periodStart || !periodEnd) {
      return NextResponse.json({
        success: true,
        ready: false,
        context: {
          organization_id: context.organizationId,
          entity_id: resolvedEntityId,
          period_id: resolvedPeriodId,
          period_start: periodStart,
          period_end: periodEnd,
          currency: context.currency || null,
        },
        health: null,
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const asOfDate = earlierDate(periodEnd, today);

    const [closingResult, periodResult, bankResult] = await Promise.all([
      loadLedgerAccountBalances({
        organizationId: context.organizationId,
        entityId: resolvedEntityId,
        startDate: null,
        endDate: asOfDate,
      }),
      loadLedgerAccountBalances({
        organizationId: context.organizationId,
        entityId: resolvedEntityId,
        startDate: periodStart,
        endDate: asOfDate,
      }),
      supabaseAdmin
        .from("bank_accounts")
        .select("id, entity_id, finance_account_id, active, updated_at")
        .eq("organization_id", context.organizationId),
    ]);

    if (bankResult.error) throw bankResult.error;
    const bankAccounts = (bankResult.data || []).filter(
      (row) => row.active !== false && (!row.entity_id || row.entity_id === resolvedEntityId),
    );
    const bankIds = bankAccounts.map((row) => row.id).filter(Boolean);

    let reconciliationRuns = [];
    if (bankIds.length) {
      const { data, error } = await supabaseAdmin
        .from("finance_bank_reconciliation_runs")
        .select("id, bank_account_id, reconciliation_date, difference_amount, status, created_at")
        .eq("organization_id", context.organizationId)
        .eq("entity_id", resolvedEntityId)
        .in("bank_account_id", bankIds)
        .lte("reconciliation_date", asOfDate)
        .order("reconciliation_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      reconciliationRuns = data || [];
    }

    const health = buildFinanceAccountHealth({
      closingResult,
      periodResult,
      bankAccounts,
      reconciliationRuns,
      periodStart,
      periodEnd,
      asOfDate,
    });

    return NextResponse.json({
      success: true,
      ready: true,
      context: {
        organization_id: context.organizationId,
        entity_id: resolvedEntityId,
        period_id: resolvedPeriodId,
        period_start: periodStart,
        period_end: periodEnd,
        as_of: asOfDate,
        period_status: context.period?.status || null,
        currency: context.currency || null,
      },
      health,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error?.message || "Unable to load Finance account health";
    console.error("FINANCE_ACCOUNT_HEALTH_FAILED", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) },
    );
  }
}
