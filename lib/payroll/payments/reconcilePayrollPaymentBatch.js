import { financeGateway } from "@/lib/finance/runtime/financeGateway";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function reconcilePayrollPaymentBatch({
  organizationId,
  payrollPaymentId,
  paymentReference,
  reconciledBy,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!payrollPaymentId) throw new Error("payrollPaymentId required");
  if (!paymentReference) throw new Error("paymentReference required");
  if (!reconciledBy) throw new Error("reconciledBy required");

  const { data: batch, error: batchError } = await supabaseAdmin
    .from("payroll_payments")
    .select("*")
    .eq("id", payrollPaymentId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (batchError) throw batchError;
  if (!batch) throw new Error("Payroll payment batch not found");

  if (batch.status === "PAID") {
    const { data: existingPayouts, error: existingError } = await supabaseAdmin
      .from("payroll_payouts")
      .select("*")
      .eq("payroll_payment_id", batch.id)
      .order("created_at", { ascending: true });

    if (existingError) throw existingError;

    return {
      success: true,
      reused: true,
      batch,
      payouts: existingPayouts || [],
    };
  }

  if (!['PREPARED', 'PROCESSING'].includes(String(batch.status || '').toUpperCase())) {
    throw new Error(`Payroll payment batch cannot be reconciled from ${batch.status}`);
  }

  if (!batch.entity_id) throw new Error("Payroll payment legal entity required");
  if (!batch.currency) throw new Error("Payroll payment currency required");

  const { data: payouts, error: payoutsError } = await supabaseAdmin
    .from("payroll_payouts")
    .select("*")
    .eq("payroll_payment_id", batch.id)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (payoutsError) throw payoutsError;
  if (!payouts?.length) throw new Error("Payroll payment batch has no payout lines");

  const recordIds = payouts.map((payout) => payout.payroll_record_id).filter(Boolean);

  const { data: records, error: recordsError } = await supabaseAdmin
    .from("payroll_records")
    .select("id,organization_id,entity_id,status,final_salary,staff_id,party_id,staff_name")
    .eq("organization_id", organizationId)
    .eq("entity_id", batch.entity_id)
    .in("id", recordIds);

  if (recordsError) throw recordsError;

  const recordsById = new Map((records || []).map((record) => [record.id, record]));

  for (const payout of payouts) {
    const record = recordsById.get(payout.payroll_record_id);

    if (!record) {
      throw new Error(`Payroll record missing for payout ${payout.id}`);
    }

    if (record.status !== "LOCKED") {
      throw new Error(`Payroll record ${record.id} must be LOCKED before payment`);
    }

    if (Math.abs(Number(record.final_salary || 0) - Number(payout.amount || 0)) > 0.01) {
      throw new Error(`Payout amount mismatch for ${record.staff_name || record.staff_id}`);
    }
  }

  const paidAt = new Date().toISOString();

  await financeGateway({
    type: "PAYROLL_SETTLEMENT",
    payload: {
      organization_id: organizationId,
      entity_id: batch.entity_id,
      source_module: "PAYROLL",
      source_id: batch.id,
      amount: Number(batch.total_amount || 0),
      tax_amount: 0,
      currency_code: batch.currency,
      exchange_rate: 1,
      posting_date: paidAt.slice(0, 10),
      document_date: paidAt.slice(0, 10),
      description: `Payroll settlement ${batch.payroll_period || batch.id}`,
      payroll_payment_id: batch.id,
      payment_reference: paymentReference,
    },
  });

  const { error: payoutUpdateError } = await supabaseAdmin
    .from("payroll_payouts")
    .update({
      payout_reference: paymentReference,
      reconciliation_reference: paymentReference,
      payout_status: "PAID",
      processed_by: reconciledBy,
      processed_at: paidAt,
      reconciled_by: reconciledBy,
      reconciled_at: paidAt,
    })
    .eq("payroll_payment_id", batch.id)
    .eq("organization_id", organizationId);

  if (payoutUpdateError) throw payoutUpdateError;

  const { error: recordsUpdateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      status: "PAID",
      payout_status: "PAID",
      payout_date: paidAt,
      payment_reference: paymentReference,
    })
    .eq("organization_id", organizationId)
    .eq("entity_id", batch.entity_id)
    .in("id", recordIds)
    .eq("status", "LOCKED");

  if (recordsUpdateError) throw recordsUpdateError;

  const { data: paidBatch, error: batchUpdateError } = await supabaseAdmin
    .from("payroll_payments")
    .update({
      payment_reference: paymentReference,
      paid_by: String(reconciledBy),
      paid_at: paidAt,
      reconciled_by: reconciledBy,
      reconciled_at: paidAt,
      status: "PAID",
    })
    .eq("id", batch.id)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (batchUpdateError) throw batchUpdateError;

  return {
    success: true,
    reused: false,
    batch: paidBatch,
    payouts: payouts.map((payout) => ({
      ...payout,
      payout_reference: paymentReference,
      payout_status: "PAID",
      processed_by: reconciledBy,
      processed_at: paidAt,
      reconciled_by: reconciledBy,
      reconciled_at: paidAt,
    })),
  };
}
