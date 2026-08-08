import { financeGateway } from "@/lib/finance/runtime/financeGateway";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function monthEnd(payrollMonth) {
  const date = new Date(`${payrollMonth}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function positiveAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : 0;
}

async function resolveCurrency({
  organizationId,
  entityId,
  staffId,
  payrollMonth,
}) {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("employee_compensation_profiles")
    .select("currency")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("staff_account_id", staffId)
    .lte("effective_from", monthEnd(payrollMonth))
    .or(`effective_to.is.null,effective_to.gte.${payrollMonth}-01`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (profileError) throw profileError;

  const currency = String(profile?.currency || "").trim().toUpperCase();
  if (currency) return currency;

  const { data: account, error: accountError } = await supabaseAdmin
    .from("chart_of_accounts")
    .select("currency_code")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("account_code", "6010")
    .eq("is_active", true)
    .maybeSingle();

  if (accountError) throw accountError;

  const fallback = String(account?.currency_code || "").trim().toUpperCase();
  if (!fallback) throw new Error("Payroll currency is not configured");

  return fallback;
}

async function postComponent({
  type,
  amount,
  record,
  currencyCode,
  postingDate,
  description,
}) {
  if (amount <= 0) return null;

  return financeGateway({
    type,
    payload: {
      organization_id: record.organization_id,
      entity_id: record.entity_id,
      source_module: "PAYROLL",
      source_id: record.id,
      amount,
      tax_amount: 0,
      currency_code: currencyCode,
      exchange_rate: 1,
      posting_date: postingDate,
      document_date: postingDate,
      description,
      staff_id: record.staff_id,
      party_id: record.party_id || null,
      payroll_month: record.payroll_month,
    },
  });
}

export default async function postPayrollAccrual({
  payrollRecordId,
  organizationId,
}) {
  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found");
  if (!record.entity_id) throw new Error("Payroll legal entity required before accounting");
  if (!record.staff_id) throw new Error("Payroll staff account required before accounting");
  if (!record.payroll_month) throw new Error("Payroll month required before accounting");

  const gross = positiveAmount(record.gross_salary);
  const net = positiveAmount(record.final_salary);
  const tax = positiveAmount(record.tax_amount);
  const socialSecurity = positiveAmount(record.social_security);
  const totalDeductions = positiveAmount(record.deductions);
  const otherDeductions = positiveAmount(
    totalDeductions - tax - socialSecurity
  );

  const componentTotal = Number(
    (net + tax + socialSecurity + otherDeductions).toFixed(2)
  );

  if (gross <= 0) {
    throw new Error("Payroll gross salary must be greater than zero before accounting");
  }

  if (Math.abs(gross - componentTotal) > 0.01) {
    throw new Error(
      `Payroll accounting imbalance: gross ${gross.toFixed(2)} != components ${componentTotal.toFixed(2)}`
    );
  }

  const currencyCode = await resolveCurrency({
    organizationId: record.organization_id,
    entityId: record.entity_id,
    staffId: record.staff_id,
    payrollMonth: record.payroll_month,
  });

  const postingDate = monthEnd(record.payroll_month);

  const results = [];

  results.push(
    await postComponent({
      type: "PAYROLL_NET",
      amount: net,
      record,
      currencyCode,
      postingDate,
      description: `Payroll net payable for ${record.staff_name || record.staff_id}`,
    })
  );

  results.push(
    await postComponent({
      type: "PAYROLL_TAX",
      amount: tax,
      record,
      currencyCode,
      postingDate,
      description: `Payroll withholding tax for ${record.staff_name || record.staff_id}`,
    })
  );

  results.push(
    await postComponent({
      type: "PAYROLL_SOCIAL_SECURITY",
      amount: socialSecurity,
      record,
      currencyCode,
      postingDate,
      description: `Payroll social security for ${record.staff_name || record.staff_id}`,
    })
  );

  results.push(
    await postComponent({
      type: "PAYROLL_DEDUCTION",
      amount: otherDeductions,
      record,
      currencyCode,
      postingDate,
      description: `Payroll employee deductions for ${record.staff_name || record.staff_id}`,
    })
  );

  return {
    success: true,
    payrollRecordId: record.id,
    postingDate,
    currencyCode,
    gross,
    postedComponents: results.filter(Boolean).length,
  };
}
