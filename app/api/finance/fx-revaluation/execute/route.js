export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { financeGateway } from "@/lib/finance/runtime/financeGateway";
import { resolveFinanceExchangeRate } from "@/lib/finance/currencies/FinanceExchangeRateResolver";

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function accountIds(value) {
  if (!Array.isArray(value)) throw new Error("FX Revaluation Accounts are invalid");
  const ids = value
    .map(item => String(item?.account_id || item || "").trim())
    .filter(Boolean);
  if (!ids.length) throw new Error("FX Revaluation requires at least one monetary Account");
  return [...new Set(ids)];
}

function signed(row) {
  return Number(row?.debit || 0) - Number(row?.credit || 0);
}

function statusFor(message) {
  const normalized = String(message || "");
  if (/permission denied|authentication|membership/i.test(normalized)) return 403;
  if (/required|not found|invalid|inactive|account|rate|currency|scope|completed|draft|revaluation/i.test(normalized)) return 400;
  return 500;
}

async function loadPriorAdjustmentMap({ organizationId, entityId, currencyCode, revaluationDate, selectedAccountIds }) {
  const { data: priorRuns, error: runError } = await supabaseAdmin
    .from("finance_fx_revaluation_runs")
    .select("journal_entry_id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("currency_code", currencyCode)
    .in("status", ["COMPLETED"])
    .lt("revaluation_date", revaluationDate)
    .not("journal_entry_id", "is", null);
  if (runError) throw runError;

  const journalIds = [...new Set((priorRuns || []).map(row => row.journal_entry_id).filter(Boolean))];
  if (!journalIds.length) return new Map();

  const { data: rows, error } = await supabaseAdmin
    .from("general_ledger")
    .select("account_id, debit, credit")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .in("journal_entry_id", journalIds)
    .in("account_id", selectedAccountIds);
  if (error) throw error;

  const adjustments = new Map();
  for (const row of rows || []) {
    const id = String(row.account_id);
    adjustments.set(id, (adjustments.get(id) || 0) + signed(row));
  }
  return adjustments;
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

    const selectedAccountIds = accountIds(run.account_ids);
    const currencyCode = required(run.currency_code, "currency_code").toUpperCase();
    const revaluationDate = required(run.revaluation_date, "revaluation_date").slice(0, 10);

    const rate = await resolveFinanceExchangeRate({
      organizationId: access.organizationId,
      entityId,
      transactionCurrency: currencyCode,
      effectiveDate: revaluationDate,
    });
    if (rate.transaction_currency === rate.functional_currency) {
      throw new Error("FX Revaluation Currency must differ from functional currency");
    }

    await supabaseAdmin
      .from("finance_fx_revaluation_runs")
      .update({ status: "EXECUTING", updated_at: new Date().toISOString() })
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entityId)
      .eq("id", run.id)
      .in("status", ["DRAFT", "EXECUTING"]);

    const { data: foreignRows, error: foreignError } = await supabaseAdmin
      .from("general_ledger")
      .select("account_id, debit, credit, exchange_rate")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entityId)
      .eq("currency_code", currencyCode)
      .lte("posting_date", revaluationDate)
      .in("account_id", selectedAccountIds);
    if (foreignError) throw foreignError;

    const priorAdjustments = await loadPriorAdjustmentMap({
      organizationId: access.organizationId,
      entityId,
      currencyCode,
      revaluationDate,
      selectedAccountIds,
    });

    const positions = new Map();
    for (const row of foreignRows || []) {
      const id = String(row.account_id);
      const amount = signed(row);
      const historicalRate = Number(row.exchange_rate || 1);
      const position = positions.get(id) || { foreign: 0, carryingBase: priorAdjustments.get(id) || 0 };
      position.foreign += amount;
      position.carryingBase += amount * historicalRate;
      positions.set(id, position);
    }

    const lines = [];
    let totalGain = 0;
    let totalLoss = 0;
    let totalAdjustment = 0;

    for (const accountId of selectedAccountIds) {
      const position = positions.get(accountId) || { foreign: 0, carryingBase: priorAdjustments.get(accountId) || 0 };
      const desiredBase = position.foreign * Number(rate.exchange_rate);
      const difference = Math.round((desiredBase - position.carryingBase) * 100) / 100;
      if (Math.abs(difference) < 0.005) continue;

      totalAdjustment += Math.abs(difference);
      if (difference > 0) {
        lines.push({
          account_id: accountId,
          description: `FX revaluation ${currencyCode} at ${rate.exchange_rate}`,
          debit: difference,
          credit: 0,
        });
        totalGain += difference;
      } else {
        const loss = Math.abs(difference);
        lines.push({
          account_id: accountId,
          description: `FX revaluation ${currencyCode} at ${rate.exchange_rate}`,
          debit: 0,
          credit: loss,
        });
        totalLoss += loss;
      }
    }

    if (totalLoss > 0) {
      lines.push({
        account_id: required(run.unrealized_loss_account_id, "unrealized_loss_account_id"),
        description: `Unrealised FX loss ${currencyCode}`,
        debit: Math.round(totalLoss * 100) / 100,
        credit: 0,
      });
    }
    if (totalGain > 0) {
      lines.push({
        account_id: required(run.unrealized_gain_account_id, "unrealized_gain_account_id"),
        description: `Unrealised FX gain ${currencyCode}`,
        debit: 0,
        credit: Math.round(totalGain * 100) / 100,
      });
    }

    if (!lines.length) {
      const completedAt = new Date().toISOString();
      const { data: completed, error: noAdjustmentError } = await supabaseAdmin
        .from("finance_fx_revaluation_runs")
        .update({
          status: "NO_ADJUSTMENT",
          closing_exchange_rate: rate.exchange_rate,
          functional_currency: rate.functional_currency,
          rate_source: rate.source,
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
      return NextResponse.json({ success: true, run: completed, journal_entry_id: null, adjustments: 0 });
    }

    const posting = await financeGateway({
      type: "DIRECT_JOURNAL_POST",
      payload: {
        organizationId: access.organizationId,
        entityId,
        postingDate: revaluationDate,
        documentDate: revaluationDate,
        journalType: "FX_REVALUATION",
        reference: `FX-${currencyCode}-${revaluationDate}`,
        sourceModule: "FINANCE",
        sourceDocument: "FX_REVALUATION_RUN",
        sourceDocumentId: run.id,
        description: run.notes || `FX revaluation ${currencyCode}`,
        currencyCode: rate.functional_currency,
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
        closing_exchange_rate: rate.exchange_rate,
        functional_currency: rate.functional_currency,
        rate_source: rate.source,
        journal_entry_id: journalEntryId,
        total_adjustment: Math.round(totalAdjustment * 100) / 100,
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
      closing_exchange_rate: rate.exchange_rate,
      functional_currency: rate.functional_currency,
      total_adjustment: completed.total_adjustment,
    });
  } catch (error) {
    const message = error?.message || "FX Revaluation execution failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
