import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizePaymentMethod(value) {
  return String(value || "bank_transfer").trim().toLowerCase();
}

export default async function preparePayrollPaymentBatch({
  organizationId,
  entityId,
  payrollMonth,
  preparedBy,
  paymentMethod = "bank_transfer",
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!payrollMonth) throw new Error("payrollMonth required");
  if (!preparedBy) throw new Error("preparedBy required");

  const method = normalizePaymentMethod(paymentMethod);

  const { data: paymentConfig, error: configError } = await supabaseAdmin
    .from("organization_payment_config")
    .select("payment_method,currency,enabled")
    .eq("organization_id", organizationId)
    .eq("payment_method", method)
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();

  if (configError) throw configError;
  if (!paymentConfig) {
    throw new Error(`Payment method ${method} is not enabled for this organization`);
  }

  const currency = String(paymentConfig.currency || "").trim().toUpperCase();
  if (!currency) throw new Error("Payment currency is not configured");

  const { data: existingBatch, error: existingError } = await supabaseAdmin
    .from("payroll_payments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("payroll_period", payrollMonth)
    .in("status", ["PREPARED", "PROCESSING", "PAID"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingBatch) {
    const { data: existingPayouts, error: payoutsError } = await supabaseAdmin
      .from("payroll_payouts")
      .select("*")
      .eq("payroll_payment_id", existingBatch.id)
      .order("created_at", { ascending: true });

    if (payoutsError) throw payoutsError;

    return {
      success: true,
      reused: true,
      batch: existingBatch,
      payouts: existingPayouts || [],
    };
  }

  const { data: records, error: recordsError } = await supabaseAdmin
    .from("payroll_records")
    .select("id,organization_id,entity_id,party_id,staff_id,staff_name,final_salary,status,payout_status,payroll_month")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("payroll_month", payrollMonth)
    .eq("status", "LOCKED")
    .order("staff_name", { ascending: true });

  if (recordsError) throw recordsError;
  if (!records?.length) {
    throw new Error("No LOCKED payroll records are available for payment");
  }

  for (const record of records) {
    if (Number(record.final_salary || 0) <= 0) {
      throw new Error(`Invalid net salary for ${record.staff_name || record.staff_id}`);
    }

    if (["PAID", "PROCESSING"].includes(String(record.payout_status || "").toUpperCase())) {
      throw new Error(`Payroll payment already started for ${record.staff_name || record.staff_id}`);
    }
  }

  const totalAmount = Number(
    records.reduce((sum, record) => sum + Number(record.final_salary || 0), 0).toFixed(2)
  );

  const { data: batch, error: batchError } = await supabaseAdmin
    .from("payroll_payments")
    .insert({
      organization_id: organizationId,
      entity_id: entityId,
      payroll_period: payrollMonth,
      payment_method: method,
      currency,
      total_amount: totalAmount,
      prepared_by: preparedBy,
      prepared_at: new Date().toISOString(),
      status: "PREPARED",
    })
    .select("*")
    .single();

  if (batchError) throw batchError;

  const payoutRows = records.map((record) => ({
    organization_id: organizationId,
    entity_id: entityId,
    payroll_payment_id: batch.id,
    payroll_record_id: record.id,
    party_id: record.party_id || null,
    staff_id: record.staff_id,
    staff_name: record.staff_name,
    amount: Number(record.final_salary || 0),
    currency,
    payment_method: method,
    payout_status: "PREPARED",
  }));

  const { data: payouts, error: payoutError } = await supabaseAdmin
    .from("payroll_payouts")
    .insert(payoutRows)
    .select("*");

  if (payoutError) {
    await supabaseAdmin
      .from("payroll_payments")
      .delete()
      .eq("id", batch.id)
      .eq("organization_id", organizationId);
    throw payoutError;
  }

  const recordIds = records.map((record) => record.id);

  const { error: recordUpdateError } = await supabaseAdmin
    .from("payroll_records")
    .update({ payout_status: "PREPARED" })
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .in("id", recordIds)
    .eq("status", "LOCKED");

  if (recordUpdateError) throw recordUpdateError;

  return {
    success: true,
    reused: false,
    batch,
    payouts: payouts || [],
  };
}
