import { resolveFinanceExchangeRate } from "@/lib/finance/currencies/FinanceExchangeRateResolver";
import { financeGateway } from "@/lib/finance/runtime/financeGateway";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const LIABILITY_CONFIG = Object.freeze({
  WITHHOLDING_TAX: {
    recordField: "tax_amount",
    financeEvent: "PAYROLL_TAX_SETTLEMENT",
  },
  SOCIAL_SECURITY: {
    recordField: "social_security",
    financeEvent: "PAYROLL_SOCIAL_SECURITY_SETTLEMENT",
  },
  EMPLOYEE_DEDUCTION: {
    recordField: "other_deduction_amount",
    financeEvent: "PAYROLL_DEDUCTION_SETTLEMENT",
  },
});

function normalizeLiabilityType(value) {
  const type = String(value || "").trim().toUpperCase();
  if (!LIABILITY_CONFIG[type]) throw new Error("Unsupported payroll liability type");
  return type;
}

function monthEnd(payrollPeriod) {
  const date = new Date(`${payrollPeriod}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

async function loadCurrency({ organizationId, entityId, payrollPeriod }) {
  const { data, error } = await supabaseAdmin
    .from("payroll_records")
    .select("staff_id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("payroll_month", payrollPeriod)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.staff_id) throw new Error("Payroll period has no payroll records");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("employee_compensation_profiles")
    .select("currency")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("staff_account_id", data.staff_id)
    .lte("effective_from", monthEnd(payrollPeriod))
    .or(`effective_to.is.null,effective_to.gte.${payrollPeriod}-01`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (profileError) throw profileError;

  const currency = String(profile?.currency || "").trim().toUpperCase();
  if (!currency) throw new Error("Payroll liability currency is not configured");
  return currency;
}

export async function preparePayrollLiabilitySettlement({
  organizationId,
  entityId,
  payrollPeriod,
  liabilityType,
  preparedBy,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!/^\d{4}-\d{2}$/.test(String(payrollPeriod || ""))) throw new Error("payrollPeriod must use YYYY-MM format");
  if (!preparedBy) throw new Error("preparedBy required");

  const type = normalizeLiabilityType(liabilityType);
  const config = LIABILITY_CONFIG[type];
  const { data: records, error } = await supabaseAdmin
    .from("payroll_records")
    .select("id,status,tax_amount,social_security,deductions")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("payroll_month", payrollPeriod);
  if (error) throw error;
  if (!records?.length) throw new Error("Payroll period has no payroll records");

  const invalid = records.find((record) => !["LOCKED", "PAID"].includes(String(record.status || "").toUpperCase()));
  if (invalid) throw new Error("Payroll liability settlement requires a fully locked payroll period");

  let amount = 0;
  if (type === "EMPLOYEE_DEDUCTION") {
    amount = records.reduce(
      (sum, record) =>
        sum + Math.max(0, Number(record.deductions || 0) - Number(record.tax_amount || 0) - Number(record.social_security || 0)),
      0
    );
  } else {
    amount = records.reduce((sum, record) => sum + Number(record[config.recordField] || 0), 0);
  }
  amount = Number(amount.toFixed(2));
  if (amount <= 0) throw new Error("Payroll liability amount is zero for this period");

  const currency = await loadCurrency({ organizationId, entityId, payrollPeriod });
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("payroll_liability_settlements")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("payroll_period", payrollPeriod)
    .eq("liability_type", type)
    .in("status", ["PREPARED", "PAID"])
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    if (Number(existing.amount) !== amount || existing.currency !== currency) {
      throw new Error("Existing payroll liability settlement no longer matches payroll; review before continuing");
    }
    return { success: true, reused: true, settlement: existing };
  }

  const { data: settlement, error: insertError } = await supabaseAdmin
    .from("payroll_liability_settlements")
    .insert({
      organization_id: organizationId,
      entity_id: entityId,
      payroll_period: payrollPeriod,
      liability_type: type,
      amount,
      currency,
      status: "PREPARED",
      prepared_by: preparedBy,
    })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return { success: true, reused: false, settlement };
}

export async function settlePayrollLiability({
  organizationId,
  entityId,
  settlementId,
  paymentReference,
  paidBy,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!settlementId) throw new Error("settlementId required");
  if (!String(paymentReference || "").trim()) throw new Error("paymentReference required");
  if (!paidBy) throw new Error("paidBy required");

  const { data: settlement, error } = await supabaseAdmin
    .from("payroll_liability_settlements")
    .select("*")
    .eq("id", settlementId)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error) throw error;
  if (!settlement) throw new Error("Payroll liability settlement not found for legal entity");

  const reference = String(paymentReference).trim();
  if (settlement.status === "PAID") {
    if (settlement.payment_reference !== reference) throw new Error("Payroll liability is already paid with a different reference");
    return { success: true, reused: true, settlement };
  }
  if (settlement.status !== "PREPARED") throw new Error(`Payroll liability cannot be paid from ${settlement.status}`);

  const config = LIABILITY_CONFIG[normalizeLiabilityType(settlement.liability_type)];
  const postingDate = new Date().toISOString().slice(0, 10);
  const exchangeRate = await resolveFinanceExchangeRate({
    organizationId,
    entityId,
    transactionCurrency: settlement.currency,
    effectiveDate: postingDate,
  });
  const financeResult = await financeGateway({
    type: config.financeEvent,
    payload: {
      organization_id: organizationId,
      entity_id: entityId,
      source_module: "PAYROLL",
      source_id: settlement.id,
      amount: Number(settlement.amount),
      tax_amount: 0,
      currency_code: settlement.currency,
      exchange_rate: exchangeRate.exchange_rate,
      posting_date: postingDate,
      document_date: postingDate,
      description: `${settlement.liability_type} settlement ${settlement.payroll_period}`,
      payroll_period: settlement.payroll_period,
      payment_reference: reference,
    },
  });
  const journalEntryId = financeResult?.journal?.id || financeResult?.ledger?.journalEntryId || null;
  if (!journalEntryId) throw new Error("Finance liability settlement did not return a journal entry id");

  const paidAt = new Date().toISOString();
  const { data: paid, error: updateError } = await supabaseAdmin
    .from("payroll_liability_settlements")
    .update({
      status: "PAID",
      payment_reference: reference,
      finance_journal_entry_id: journalEntryId,
      paid_by: paidBy,
      paid_at: paidAt,
    })
    .eq("id", settlement.id)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("status", "PREPARED")
    .select("*")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!paid) throw new Error("Payroll liability settlement changed during payment; refresh before retrying");

  return { success: true, reused: false, settlement: paid, journalEntryId };
}
