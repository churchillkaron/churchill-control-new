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

function positiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${field} must be greater than zero`);
  }
  return number;
}

function statusFor(message) {
  const normalized = String(message || "");
  if (/permission denied|authentication|membership/i.test(normalized)) return 403;
  if (/required|not found|must|already|draft|period|unbalanced|positive|account|currency/i.test(normalized)) return 400;
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
      capabilityId: "opening_balances",
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
    const batchId = required(
      body.batch_id || body.batchId || body.id || body.record_id,
      "batch_id"
    );

    const { data: batch, error: batchError } = await supabaseAdmin
      .from("finance_opening_balance_batches")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entityId)
      .eq("id", batchId)
      .maybeSingle();

    if (batchError) throw batchError;
    if (!batch) throw new Error("Opening Balance batch not found");

    const currentStatus = String(batch.status || "DRAFT").trim().toUpperCase();
    if (currentStatus === "POSTED" && batch.journal_entry_id) {
      return NextResponse.json({
        success: true,
        idempotent: true,
        batch,
        journal_entry_id: batch.journal_entry_id,
      });
    }
    if (currentStatus !== "DRAFT") {
      throw new Error("Only a DRAFT Opening Balance batch can be posted");
    }

    const lines = Array.isArray(batch.lines) ? batch.lines : [];
    if (lines.length < 2) {
      throw new Error("Opening Balance batch must contain at least two balanced lines");
    }

    const posting = await financeGateway({
      type: "DIRECT_JOURNAL_POST",
      payload: {
        organizationId: access.organizationId,
        entityId,
        postingDate: required(batch.posting_date, "posting_date"),
        documentDate: batch.posting_date,
        journalType: "OPENING_BALANCE",
        reference: batch.reference || null,
        sourceModule: "FINANCE",
        sourceDocument: "OPENING_BALANCE_BATCH",
        sourceDocumentId: batch.id,
        description: batch.description || "Opening balances",
        currencyCode: required(batch.currency_code, "currency_code").toUpperCase(),
        exchangeRate: positiveNumber(batch.exchange_rate ?? 1, "exchange_rate"),
        lines,
        createdBy: actorId,
        idempotencyKey: `opening-balance:${access.organizationId}:${entityId}:${batch.id}`,
      },
    });

    const journalEntryId =
      posting?.journal?.id ||
      posting?.ledger?.journalEntryId ||
      null;
    if (!journalEntryId) throw new Error("Opening Balance journal posting did not return a journal entry id");

    const postedAt = new Date().toISOString();
    const { data: postedBatch, error: updateError } = await supabaseAdmin
      .from("finance_opening_balance_batches")
      .update({
        status: "POSTED",
        journal_entry_id: journalEntryId,
        posted_at: postedAt,
        posted_by: actorId,
        updated_at: postedAt,
      })
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entityId)
      .eq("id", batch.id)
      .eq("status", "DRAFT")
      .select("*")
      .maybeSingle();

    if (updateError) throw updateError;

    if (!postedBatch) {
      const { data: replayBatch, error: replayError } = await supabaseAdmin
        .from("finance_opening_balance_batches")
        .select("*")
        .eq("organization_id", access.organizationId)
        .eq("entity_id", entityId)
        .eq("id", batch.id)
        .maybeSingle();
      if (replayError) throw replayError;
      if (String(replayBatch?.status || "").toUpperCase() !== "POSTED") {
        throw new Error("Opening Balance batch status changed before posting completed");
      }
      return NextResponse.json({
        success: true,
        idempotent: true,
        batch: replayBatch,
        journal_entry_id: replayBatch.journal_entry_id || journalEntryId,
        posting,
      });
    }

    return NextResponse.json({
      success: true,
      idempotent: Boolean(posting?.ledger?.idempotentReplay),
      batch: postedBatch,
      journal_entry_id: journalEntryId,
      posting,
    });
  } catch (error) {
    const message = error?.message || "Opening Balance posting failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
