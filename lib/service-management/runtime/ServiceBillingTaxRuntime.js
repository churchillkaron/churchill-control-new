import { TaxCodeRepository } from "@/lib/finance/tax-codes/repositories/taxCodeRepository";

function effectiveOn(rule, dateValue) {
  if (!rule || rule.is_active === false) return false;
  const date = String(dateValue || "").slice(0, 10);
  if (!date) return false;
  if (rule.effective_from && String(rule.effective_from).slice(0, 10) > date) return false;
  if (rule.effective_to && String(rule.effective_to).slice(0, 10) < date) return false;
  return true;
}

export async function resolveServiceBillingTax({
  organizationId,
  taxCodeId = null,
  amount = 0,
  effectiveAt,
}) {
  const normalizedAmount = Number(amount || 0);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
    const error = new Error("Configured service billing amount is invalid.");
    error.status = 409;
    throw error;
  }

  if (!taxCodeId) {
    return {
      tax_amount: 0,
      tax_code_id: null,
      tax_code: null,
      tax_rate: 0,
    };
  }

  const rule = await TaxCodeRepository.get({
    organizationId,
    taxCodeId,
  });

  if (!rule || !effectiveOn(rule, effectiveAt)) {
    const error = new Error("Configured service tax rule is missing or not effective on the billing date.");
    error.status = 409;
    throw error;
  }

  const rate = Number(rule.tax_rate);
  if (!Number.isFinite(rate) || rate < 0) {
    const error = new Error("Configured service tax rate is invalid.");
    error.status = 409;
    throw error;
  }

  return {
    tax_amount: Number(((normalizedAmount * rate) / 100).toFixed(4)),
    tax_code_id: rule.id,
    tax_code: rule.tax_code || null,
    tax_rate: rate,
  };
}

export default resolveServiceBillingTax;
