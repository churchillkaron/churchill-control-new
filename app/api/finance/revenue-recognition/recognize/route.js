export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { financeGateway } from "@/lib/finance/runtime/financeGateway";

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function dateOnly(value, field) {
  const normalized = required(value, field).slice(0, 10);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be a valid date`);
  return normalized;
}

function optionalAmount(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error("Recognition Amount must be greater than zero");
  }
  return number;
}

function statusFor(message) {
  const normalized = String(message || "");
  if (/permission denied|authentication|membership/i.test(normalized)) return 403;
  if (/required|valid|not found|not active|outside|supported|amount|deferred|recognized|account|currency|due|claimed|idempotency/i.test(normalized)) return 400;
  return 500;
}

async function markRunFailed(runId, error) {
  if (!runId) return;
  await supabaseAdmin
    .from("finance_revenue_recognition_runs")
    .update({
      status: "FAILED",
      error_message: String(error?.message || "Revenue Recognition failed").slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("status", "CLAIMED");
}

export async function POST(request) {
  let runId = null;
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
      capabilityId: "revenue_recognition",
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
    const scheduleId = required(
      body.schedule_id || body.scheduleId || body.id || body.record_id,
      "schedule_id"
    );
    const recognitionDate = dateOnly(
      body.recognition_date || body.recognitionDate,
      "recognition_date"
    );
    const requestedAmount = optionalAmount(
      body.recognition_amount ?? body.recognitionAmount
    );
    const idempotencyKey = required(
      body.idempotency_key || body.idempotencyKey || request.headers.get("idempotency-key"),
      "idempotency_key"
    );

    const { data: claim, error: claimError } = await supabaseAdmin.rpc(
      "claim_finance_revenue_recognition",
      {
        p_organization_id: access.organizationId,
        p_entity_id: entityId,
        p_schedule_id: scheduleId,
        p_recognition_date: recognitionDate,
        p_requested_amount: requestedAmount,
        p_idempotency_key: idempotencyKey,
      }
    );
    if (claimError) throw new Error(claimError.message);

    runId = required(claim?.run_id, "recognition run id");
    if (claim?.status === "COMPLETED" && claim?.journal_entry_id) {
      return NextResponse.json({
        success: true,
        idempotent: true,
        run_id: runId,
        journal_entry_id: claim.journal_entry_id,
        recognition_amount: claim.amount,
      });
    }

    const { data: schedule, error: scheduleError } = await supabaseAdmin
      .from("finance_revenue_recognition_schedules")
      .select("id, organization_id, entity_id, contract_reference, contract_number, description, currency_code, exchange_rate, revenue_account_id, deferred_revenue_account_id")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entityId)
      .eq("id", scheduleId)
      .maybeSingle();
    if (scheduleError) throw scheduleError;
    if (!schedule) throw new Error("Revenue Recognition schedule not found");

    const amount = Number(claim?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Revenue Recognition amount is invalid");
    }

    const posting = await financeGateway({
      type: "DIRECT_JOURNAL_POST",
      payload: {
        organizationId: access.organizationId,
        entityId,
        postingDate: recognitionDate,
        documentDate: recognitionDate,
        journalType: "REVENUE_RECOGNITION",
        reference: schedule.contract_reference || schedule.contract_number || `REVREC-${schedule.id}`,
        sourceModule: "FINANCE",
        sourceDocument: "REVENUE_RECOGNITION_SCHEDULE",
        sourceDocumentId: schedule.id,
        description: schedule.description || "Revenue recognition",
        currencyCode: required(schedule.currency_code, "currency_code").toUpperCase(),
        exchangeRate: Number(schedule.exchange_rate || 1),
        lines: [
          {
            account_id: required(schedule.deferred_revenue_account_id, "deferred_revenue_account_id"),
            description: schedule.description || "Recognize deferred revenue",
            debit: amount,
            credit: 0,
          },
          {
            account_id: required(schedule.revenue_account_id, "revenue_account_id"),
            description: schedule.description || "Recognized revenue",
            debit: 0,
            credit: amount,
          },
        ],
        createdBy: actorId,
        idempotencyKey: `revenue-recognition:${runId}`,
      },
    });

    const journalEntryId = posting?.journal?.id || posting?.ledger?.journalEntryId || null;
    if (!journalEntryId) throw new Error("Revenue Recognition posting did not return a journal entry id");

    const { data: finalized, error: finalizeError } = await supabaseAdmin.rpc(
      "finalize_finance_revenue_recognition",
      {
        p_run_id: runId,
        p_journal_entry_id: journalEntryId,
      }
    );
    if (finalizeError) throw new Error(finalizeError.message);

    return NextResponse.json({
      success: true,
      idempotent: Boolean(posting?.ledger?.idempotentReplay || finalized?.idempotent),
      run_id: runId,
      journal_entry_id: journalEntryId,
      recognition_amount: amount,
      recognized_amount: finalized?.recognized_amount,
      deferred_amount: finalized?.deferred_amount,
      status: finalized?.status,
    });
  } catch (error) {
    await markRunFailed(runId, error);
    const message = error?.message || "Revenue Recognition failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
