export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { financeGateway } from "@/lib/finance/runtime/financeGateway";
import { buildFxRevaluationPlan } from "@/lib/finance/currencies/FinanceFxRevaluationPlan";

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  const normalized = String(message || "");
  if (/permission denied|authentication|membership/i.test(normalized)) return 403;
  if (/required|not found|invalid|inactive|account|rate|currency|scope|completed|draft|revaluation|historical/i.test(normalized)) return 400;
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
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    await requireFinanceWorkspacePermission({
      capabilityId: "fx_revaluation",
      operation: "write",
      access,
    });

    const actorId = required(access.user?.id, "authenticated user");
    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: actorId,
      permissionKey: "finance.journals.post",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const entityId = required(body.entityId || body.entity_id, "entity_id");
    const runId = required(body.run_id || body.runId || body.id || body.record_id, "run_id");

    const { data: run, error: runError } = await supabaseAdmin
      .from("finance_fx_revaluation_runs")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entityId)
      .eq("id", runId)
      .maybeSingle();
    if (runError) throw runError;
    if (!run) throw new Error("FX Revaluation run not found");

    const currentStatus = String(run.status || "DRAFT").toUpperCase();
    if (currentStatus === "COMPLETED" && run.journal_entry_id) {
      return NextResponse.json({
        success: true,
        idempotent: true,
        run,
        journal_entry_id: run.journal_entry_id,
      });
    }
    if (currentStatus === "NO_ADJUSTMENT") {
      return NextResponse.json({ success: true, idempotent: true, run, journal_entry_id: null });
    }
    if (!["DRAFT", "EXECUTING"].includes(currentStatus)) {
      throw new Error("FX Revaluation run is not executable");
    }

    const plan = await buildFxRevaluationPlan({
      organizationId: access.organizationId,
      entityId,
      revaluationDate: run.revaluation_date,
      currencyCode: run.currency_code,
      accountIds: run.account_ids,
      excludeRunId: run.id,
    });

    if (!plan.can_post) {
      throw new Error("FX Revaluation cannot post until historical exchange-rate evidence is complete");
    }

    const rateSource = plan.rate.configured_source || plan.rate.resolver_source || "CONFIGURED";

    await supabaseAdmin
      .from("finance_fx_revaluation_runs")
      .update({ status: "EXECUTING", updated_at: new Date().toISOString() })
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entityId)
      .eq("id", run.id)
      .in("status", ["DRAFT", "EXECUTING"]);

    const lines = [...plan.adjustment_lines];

    if (plan.total_loss > 0) {
      lines.push({
        account_id: required(run.unrealized_loss_account_id, "unrealized_loss_account_id"),
        description: `Unrealised FX loss ${plan.currency_code}`,
        debit: plan.total_loss,
        credit: 0,
      });
    }
    if (plan.total_gain > 0) {
      lines.push({
        account_id: required(run.unrealized_gain_account_id, "unrealized_gain_account_id"),
        description: `Unrealised FX gain ${plan.currency_code}`,
        debit: 0,
        credit: plan.total_gain,
      });
    }

    if (!lines.length) {
      const completedAt = new Date().toISOString();
      const { data: completed, error: noAdjustmentError } = await supabaseAdmin
        .from("finance_fx_revaluation_runs")
        .update({
          status: "NO_ADJUSTMENT",
          closing_exchange_rate: plan.rate.exchange_rate,
          functional_currency: plan.functional_currency,
          rate_source: rateSource,
          total_adjustment: 0,
          completed_at: completedAt,
          updated_at: completedAt,
        })
        .eq("organization_id", access.organizationId)
        .eq("entity_id", entityId)
        .eq("id", run.id)
        .select("*")
        .single();
      if (noAdjustmentError) throw noAdjustmentError;
      return NextResponse.json({
        success: true,
        run: completed,
        journal_entry_id: null,
        adjustments: 0,
        plan,
      });
    }

    const posting = await financeGateway({
      type: "DIRECT_JOURNAL_POST",
      payload: {
        organizationId: access.organizationId,
        entityId,
        postingDate: plan.revaluation_date,
        documentDate: plan.revaluation_date,
        journalType: "FX_REVALUATION",
        reference: `FX-${plan.currency_code}-${plan.revaluation_date}`,
        sourceModule: "FINANCE",
        sourceDocument: "FX_REVALUATION_RUN",
        sourceDocumentId: run.id,
        description: run.notes || `FX revaluation ${plan.currency_code}`,
        currencyCode: plan.functional_currency,
        exchangeRate: 1,
        lines,
        createdBy: actorId,
        idempotencyKey: `fx-revaluation:${run.id}`,
      },
    });

    const journalEntryId = posting?.journal?.id || posting?.ledger?.journalEntryId || null;
    if (!journalEntryId) throw new Error("FX Revaluation posting did not return a journal entry id");

    const completedAt = new Date().toISOString();
    const { data: completed, error: updateError } = await supabaseAdmin
      .from("finance_fx_revaluation_runs")
      .update({
        status: "COMPLETED",
        closing_exchange_rate: plan.rate.exchange_rate,
        functional_currency: plan.functional_currency,
        rate_source: rateSource,
        journal_entry_id: journalEntryId,
        total_adjustment: plan.total_adjustment,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entityId)
      .eq("id", run.id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      idempotent: Boolean(posting?.ledger?.idempotentReplay),
      run: completed,
      journal_entry_id: journalEntryId,
      closing_exchange_rate: plan.rate.exchange_rate,
      functional_currency: plan.functional_currency,
      total_adjustment: completed.total_adjustment,
      plan,
    });
  } catch (error) {
    const message = error?.message || "FX Revaluation execution failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
