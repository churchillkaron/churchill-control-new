export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { createCustomerInvoiceCommand } from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { loadCompletePracticeRows } from "@/lib/finance/practice/FinancePracticePopulation";
import { loadPracticeBillingReferenceBlockers } from "@/lib/finance/practice/FinancePracticeBillingReferenceReadiness";

function clean(value) { return String(value ?? "").trim(); }
function jsonError(error, status = 400, extra = {}) { return NextResponse.json({ success: false, error, ...extra }, { status }); }
function staffId(access) { return access?.access?.staffAccountId || access?.staff?.id || null; }
function addDays(date, days) { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + Number(days || 0)); return value.toISOString().slice(0, 10); }
function periodKey(date, cadence) {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (cadence === "MONTHLY") return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  if (cadence === "QUARTERLY") return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  if (cadence === "ANNUAL") return `${d.getUTCFullYear()}`;
  return date;
}
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function invoiceId(result) { return result?.invoice_id || result?.customer_invoice_id || result?.invoice?.id || result?.id || null; }

export async function POST(request) {
  let batch = null;
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const engagementId = clean(body.engagementId || body.engagement_id);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey: "finance.receivables.manage", fullAccess: access.permissions?.includes("*") === true });
    if (!engagementId) return jsonError("engagementId is required");

    for (let recoveryPass = 0; recoveryPass < 20; recoveryPass += 1) {
      const { data: unresolvedBatch, error: unresolvedError } = await supabaseAdmin.from("accounting_practice_billing_batches")
        .select("*")
        .eq("accounting_firm_id", access.organizationId)
        .eq("engagement_id", engagementId)
        .in("status", ["PREPARING", "FAILED"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (unresolvedError) throw unresolvedError;
      if (!unresolvedBatch) { batch = null; break; }

      batch = unresolvedBatch;
      const { data: recovery, error: recoveryError } = await supabaseAdmin.rpc("recover_accounting_practice_billing_batch", {
        p_accounting_firm_id: access.organizationId,
        p_batch_id: unresolvedBatch.id,
        p_actor_id: staffId(access),
      });
      if (recoveryError) throw recoveryError;
      const recoveryState = clean(recovery?.state).toUpperCase();
      if (["RECOVERED_INVOICE", "INVOICED"].includes(recoveryState)) {
        return NextResponse.json({
          success: true,
          idempotent: true,
          recovered: true,
          billing_batch: recovery?.billing_batch || unresolvedBatch,
          invoice_id: recovery?.invoice_id || recovery?.billing_batch?.invoice_id || null,
        });
      }
      if (recoveryState === "WAITING") {
        return jsonError("A billing batch is already preparing for this engagement. Retry after the existing batch completes or becomes recoverable.", 409, {
          billing_batch_id: unresolvedBatch.id,
          billing_batch_status: unresolvedBatch.status,
          retry_after: recovery?.retry_after || null,
        });
      }
      if (!["VOIDED_UNINVOICED", "VOID"].includes(recoveryState)) {
        return jsonError("Existing billing batch could not be reconciled safely", 409, { billing_batch_id: unresolvedBatch.id });
      }
      batch = null;
    }

    if (batch?.id) return jsonError("Too many unresolved billing batches require recovery before new invoicing", 409);

    const { data: profile, error: profileError } = await supabaseAdmin.from("accounting_practice_billing_profiles")
      .select("*").eq("accounting_firm_id", access.organizationId).eq("engagement_id", engagementId).eq("status", "ACTIVE").maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return jsonError("Billing policy is not configured for this engagement", 409);
    if (profile.billing_method === "NON_BILLABLE") return jsonError("This engagement is configured as non-billable", 409);
    if (!profile.billing_entity_id) return jsonError("Billing entity must be configured before invoicing", 409);
    if (!profile.customer_party_id) return jsonError("Finance customer party must be configured before invoicing", 409);
    if (!profile.revenue_account_id) return jsonError("Revenue account must be configured before invoicing", 409);
    if (!profile.tax_rule_id) return jsonError("Finance tax rule must be configured before invoicing", 409);
    if (profile.tax_treatment_confirmed !== true) return jsonError("Tax treatment must be confirmed before invoicing", 409);
    const liveReferenceBlockers = await loadPracticeBillingReferenceBlockers({ accountingFirmId: access.organizationId, profiles: [profile] });
    const referenceBlockers = liveReferenceBlockers.get(profile.id) || [];
    if (referenceBlockers.length) return jsonError(`Billing policy references are no longer valid: ${referenceBlockers.join(", ")}`, 409);

    const [{ data: entity, error: entityError }, { data: party, error: partyError }, { data: engagement, error: engagementError }] = await Promise.all([
      supabaseAdmin.from("legal_entities").select("id,currency").eq("id", profile.billing_entity_id).eq("organization_id", access.organizationId).eq("is_active", true).maybeSingle(),
      supabaseAdmin.from("parties").select("id,display_name,legal_name").eq("id", profile.customer_party_id).eq("organization_id", access.organizationId).maybeSingle(),
      supabaseAdmin.from("accounting_engagements").select("id,organization_id,service_package").eq("id", engagementId).eq("accounting_firm_id", access.organizationId).maybeSingle(),
    ]);
    if (entityError) throw entityError; if (partyError) throw partyError; if (engagementError) throw engagementError;
    if (!entity) return jsonError("Configured billing entity is not available", 409);
    if (!party) return jsonError("Configured Finance customer party is not available", 409);
    if (!engagement) return jsonError("Accounting engagement not found", 404);

    const rows = await loadCompletePracticeRows({
      label: "Accounting practice approved billable time",
      buildQuery: (from, to) => supabaseAdmin.from("accounting_practice_time_entries")
        .select("id,work_date,minutes,billing_rate,currency_code,status,billable")
        .eq("accounting_firm_id", access.organizationId)
        .eq("engagement_id", engagementId)
        .eq("status", "APPROVED")
        .eq("billable", true)
        .order("work_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    });
    const unpriced = rows.filter((row) => row.billing_rate == null);
    if (profile.billing_method === "TIME_AND_MATERIALS" && !rows.length) return jsonError("No approved unbilled time is available for this time-and-materials engagement", 409);
    if (["TIME_AND_MATERIALS","HYBRID"].includes(profile.billing_method) && unpriced.length) return jsonError("All approved billable time must have a governed billing rate before invoicing", 409);

    const timeValue = rows.reduce((sum, row) => sum + Number(row.billing_rate || 0) * Number(row.minutes || 0) / 60, 0);
    const fixedValue = ["FIXED_FEE","HYBRID"].includes(profile.billing_method) ? Number(profile.fixed_fee_amount || 0) : 0;
    if (["FIXED_FEE","HYBRID"].includes(profile.billing_method) && fixedValue <= 0) return jsonError("Fixed fee amount must be configured before invoicing", 409);
    const subtotal = Math.round((profile.billing_method === "TIME_AND_MATERIALS" ? timeValue : profile.billing_method === "FIXED_FEE" ? fixedValue : fixedValue + timeValue) * 100) / 100;
    if (subtotal <= 0) return jsonError("Billing amount must be greater than zero", 409);
    const taxAmount = Math.round(subtotal * Number(profile.tax_rate_percent || 0)) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
    const entryIds = rows.map((row) => row.id).sort();
    const invoiceDate = clean(body.invoiceDate || body.invoice_date || new Date().toISOString().slice(0, 10));
    const cadence = clean(profile.billing_cadence || "ON_DEMAND").toUpperCase();
    if (cadence !== "ON_DEMAND" && !profile.next_billing_date) return jsonError("Next billing date must be configured for recurring practice billing", 409);
    const billingDate = cadence === "ON_DEMAND" ? invoiceDate : profile.next_billing_date;
    const billingPeriodKey = clean(body.billingPeriodKey || body.billing_period_key) || periodKey(billingDate, cadence);
    const periodStart = rows[0]?.work_date || billingDate;
    const periodEnd = rows[rows.length - 1]?.work_date || billingDate;
    const key = `practice-wip:${sha(JSON.stringify({ engagementId, billingPeriodKey, entryIds, billing_method: profile.billing_method, fixedValue, subtotal, taxAmount })).slice(0, 40)}`;

    const { data: existing, error: existingError } = await supabaseAdmin.from("accounting_practice_billing_batches").select("*").eq("accounting_firm_id", access.organizationId).eq("idempotency_key", key).maybeSingle();
    if (existingError) throw existingError;
    batch = existing;
    if (!batch) {
      const { data, error } = await supabaseAdmin.from("accounting_practice_billing_batches").insert({
        accounting_firm_id: access.organizationId, organization_id: engagement.organization_id, engagement_id: engagement.id, billing_period_key: billingPeriodKey, billing_profile_id: profile.id,
        time_entry_ids: entryIds, service_period_start: periodStart, service_period_end: periodEnd, subtotal, tax_amount: taxAmount, total_amount: totalAmount,
        currency_code: profile.currency_code || entity.currency || "THB", status: "PREPARING", idempotency_key: key, prepared_by: staffId(access), metadata: { billing_method: profile.billing_method, time_value: timeValue, fixed_fee_value: fixedValue, billing_cadence: cadence, billing_date: billingDate },
      }).select("*").single();
      if (error) throw error; batch = data;
    }
    if (batch.status === "INVOICED" && batch.invoice_id) return NextResponse.json({ success: true, idempotent: true, billing_batch: batch, invoice_id: batch.invoice_id });

    const { data: liveBatch, error: liveBatchError } = await supabaseAdmin.from("accounting_practice_billing_batches")
      .select("id,status")
      .eq("id", batch.id)
      .eq("accounting_firm_id", access.organizationId)
      .maybeSingle();
    if (liveBatchError) throw liveBatchError;
    if (!liveBatch || !["PREPARING", "FAILED"].includes(liveBatch.status)) {
      return jsonError("Billing batch changed before invoice creation; refresh and retry", 409, { billing_batch_id: batch.id, billing_batch_status: liveBatch?.status || null });
    }

    const dueDate = clean(body.dueDate || body.due_date || addDays(invoiceDate, profile.payment_terms_days || 0));
    const currencyCode = clean(profile.currency_code || entity.currency || "THB").toUpperCase();
    const description = `${engagement.service_package || "Professional accounting services"} · ${periodStart} to ${periodEnd}`;
    const result = await createCustomerInvoiceCommand({
      organization_id: access.organizationId, entity_id: profile.billing_entity_id, party_id: profile.customer_party_id,
      invoice_date: invoiceDate, due_date: dueDate, currency_code: currencyCode,
      lines: [{ description, quantity: 1, unit_price: subtotal, discount_amount: 0, tax_amount: taxAmount, tax_rule_id: profile.tax_rule_id || null, tax_code_id: profile.tax_rule_id || null, revenue_account_id: profile.revenue_account_id || null }],
      tax_amount: taxAmount, notes: `Accounting practice billing from governed WIP batch ${batch.id}`, created_by: access.user?.id || null,
      idempotency_key: key, source_document_type: "ACCOUNTING_PRACTICE_WIP", source_document_id: batch.id,
    });
    const createdInvoiceId = invoiceId(result);
    if (!createdInvoiceId) throw new Error("Customer invoice authority returned no invoice id");

    const { data: finalization, error: finalizationError } = await supabaseAdmin.rpc("finalize_accounting_practice_billing_batch", {
      p_accounting_firm_id: access.organizationId,
      p_batch_id: batch.id,
      p_invoice_id: createdInvoiceId,
      p_actor_id: staffId(access),
    });
    if (finalizationError) throw finalizationError;
    const completedBatch = finalization?.billing_batch || null;
    if (!completedBatch?.id || completedBatch.status !== "INVOICED") throw new Error("Practice billing finalization returned no invoiced batch");
    return NextResponse.json({ success: true, idempotent: finalization?.idempotent === true, billing_batch: completedBatch, invoice_id: createdInvoiceId, invoice_total: totalAmount, customer: party.display_name || party.legal_name || "Finance customer", billing_period_key: billingPeriodKey }, { status: 201 });
  } catch (error) {
    if (batch?.id) {
      try {
        await supabaseAdmin.from("accounting_practice_billing_batches").update({ status: "FAILED", failure_reason: String(error?.message || error).slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", batch.id).in("status", ["PREPARING", "FAILED"]);
      } catch {}
    }
    const message = error?.message || "Unable to create practice billing invoice";
    const status = /permission denied/i.test(message) ? 403 : /PRACTICE_BILLING_|billing batch|billing policy/i.test(message) ? 409 : 500;
    return jsonError(message, status);
  }
}
