import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizePaymentMethod(value) {
  return String(value || "bank_transfer").trim().toLowerCase();
}

function normalizeCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function normalizeCountry(value) {
  return String(value || "").trim().toUpperCase() || null;
}

function monthEnd(payrollMonth) {
  const date = new Date(`${payrollMonth}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function validateBatchCoverage({ records, payouts, currency }) {
  if (payouts.length !== records.length) {
    throw new Error("Payroll payment batch does not cover the complete payroll month");
  }

  const recordsById = new Map(records.map((record) => [record.id, record]));
  const seenRecordIds = new Set();

  for (const payout of payouts) {
    const record = recordsById.get(payout.payroll_record_id);

    if (!record || seenRecordIds.has(record.id)) {
      throw new Error("Payroll payment batch contains invalid or duplicate payroll records");
    }

    seenRecordIds.add(record.id);

    if (Math.abs(Number(record.final_salary || 0) - Number(payout.amount || 0)) > 0.01) {
      throw new Error(`Payout amount mismatch for ${record.staff_name || record.staff_id}`);
    }

    if (String(payout.currency || "").trim().toUpperCase() !== currency) {
      throw new Error(`Payout currency mismatch for ${record.staff_name || record.staff_id}`);
    }
  }
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

  const { data: entity, error: entityError } = await supabaseAdmin
    .from("legal_entities")
    .select("id,organization_id,legal_name,display_name,country,currency,is_active")
    .eq("id", entityId)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (entityError) throw entityError;
  if (!entity) {
    throw new Error("Payroll legal entity is not active in this organization");
  }

  const currency = normalizeCurrency(entity.currency);
  const country = normalizeCountry(entity.country);
  if (!currency) throw new Error("Payroll legal entity currency is not configured");
  if (!country) throw new Error("Payroll legal entity country is not configured");

  const { data: paymentConfigs, error: configError } = await supabaseAdmin
    .from("organization_payment_config")
    .select("payment_method,country,currency,enabled")
    .eq("organization_id", organizationId)
    .eq("payment_method", method)
    .eq("enabled", true);

  if (configError) throw configError;

  const paymentConfig = (paymentConfigs || []).find((config) => {
    const configCurrency = normalizeCurrency(config.currency);
    const configCountry = normalizeCountry(config.country);
    return configCurrency === currency && (!configCountry || configCountry === country);
  });

  if (!paymentConfig) {
    throw new Error(
      `Payment method ${method} is not enabled for legal entity jurisdiction ${country} / ${currency}`
    );
  }

  const { data: records, error: recordsError } = await supabaseAdmin
    .from("payroll_records")
    .select("id,organization_id,entity_id,party_id,staff_id,staff_name,final_salary,status,payout_status,payroll_month")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("payroll_month", payrollMonth)
    .order("staff_name", { ascending: true });

  if (recordsError) throw recordsError;
  if (!records?.length) {
    throw new Error("No payroll records are available for this payroll month");
  }

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
    if (String(existingBatch.payment_method || "").toLowerCase() !== method) {
      throw new Error("Existing payroll payment batch uses a different payment method");
    }

    if (String(existingBatch.currency || "").trim().toUpperCase() !== currency) {
      throw new Error("Existing payroll payment batch uses a different currency");
    }

    const { data: existingPayouts, error: payoutsError } = await supabaseAdmin
      .from("payroll_payouts")
      .select("*")
      .eq("payroll_payment_id", existingBatch.id)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });

    if (payoutsError) throw payoutsError;

    validateBatchCoverage({
      records,
      payouts: existingPayouts || [],
      currency,
    });

    const expectedTotal = Number(
      records.reduce((sum, record) => sum + Number(record.final_salary || 0), 0).toFixed(2)
    );

    if (Math.abs(expectedTotal - Number(existingBatch.total_amount || 0)) > 0.01) {
      throw new Error("Existing payroll payment batch total no longer matches the payroll month");
    }

    return {
      success: true,
      reused: true,
      entity,
      batch: existingBatch,
      payouts: existingPayouts || [],
    };
  }

  const unlockedRecord = records.find((record) => record.status !== "LOCKED");

  if (unlockedRecord) {
    throw new Error(
      `Payroll month must be fully LOCKED before payment preparation: ${unlockedRecord.staff_name || unlockedRecord.staff_id} is ${unlockedRecord.status}`
    );
  }

  for (const record of records) {
    if (Number(record.final_salary || 0) <= 0) {
      throw new Error(`Invalid net salary for ${record.staff_name || record.staff_id}`);
    }

    if (["PREPARED", "PROCESSING", "PAID"].includes(String(record.payout_status || "").toUpperCase())) {
      throw new Error(`Payroll payment already started for ${record.staff_name || record.staff_id}`);
    }
  }

  const staffIds = records.map((record) => record.staff_id).filter(Boolean);

  const { data: compensationProfiles, error: compensationError } = await supabaseAdmin
    .from("employee_compensation_profiles")
    .select("staff_account_id,currency,bank_name,bank_account,effective_from,effective_to")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .in("staff_account_id", staffIds)
    .lte("effective_from", monthEnd(payrollMonth))
    .or(`effective_to.is.null,effective_to.gte.${payrollMonth}-01`)
    .order("effective_from", { ascending: false });

  if (compensationError) throw compensationError;

  const compensationByStaff = new Map();

  for (const profile of compensationProfiles || []) {
    if (!compensationByStaff.has(profile.staff_account_id)) {
      compensationByStaff.set(profile.staff_account_id, profile);
    }
  }

  for (const record of records) {
    const profile = compensationByStaff.get(record.staff_id);

    if (!profile) {
      throw new Error(`Missing compensation profile for ${record.staff_name || record.staff_id}`);
    }

    const profileCurrency = String(profile.currency || "").trim().toUpperCase();
    if (!profileCurrency || profileCurrency !== currency) {
      throw new Error(`Payment currency mismatch for ${record.staff_name || record.staff_id}`);
    }

    if (method === "bank_transfer" && (!profile.bank_name || !profile.bank_account)) {
      throw new Error(`Bank details missing for ${record.staff_name || record.staff_id}`);
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

  const payoutRows = records.map((record) => {
    const profile = compensationByStaff.get(record.staff_id);

    return {
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
      bank_name: profile?.bank_name || null,
      bank_account: profile?.bank_account || null,
      payout_status: "PREPARED",
    };
  });

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
    .eq("payroll_month", payrollMonth)
    .in("id", recordIds)
    .eq("status", "LOCKED");

  if (recordUpdateError) throw recordUpdateError;

  return {
    success: true,
    reused: false,
    entity,
    batch,
    payouts: payouts || [],
  };
}
