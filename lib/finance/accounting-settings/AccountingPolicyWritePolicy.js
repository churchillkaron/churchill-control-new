import {
  FINANCE_ACCOUNTING_POLICY_OPTIONS,
  FINANCE_ACCOUNTING_POLICY_VALUE_OPTIONS,
  getFinanceAccountingPolicyDefinition,
  getFinanceAccountingPolicyOption,
  normalizeFinanceAccountingPolicyKey,
  normalizeFinanceAccountingPolicyValue,
} from "./FinanceAccountingPolicyDefinitions";

export const ACCOUNTING_POLICY_FORM_OPTIONS = FINANCE_ACCOUNTING_POLICY_OPTIONS;
export const ACCOUNTING_POLICY_FORM_VALUE_OPTIONS = FINANCE_ACCOUNTING_POLICY_VALUE_OPTIONS;

export function normalizeAccountingPolicyPayload(payload = {}) {
  const normalized = { ...payload };

  if (Object.prototype.hasOwnProperty.call(normalized, "setting_key")) {
    normalized.setting_key = normalizeFinanceAccountingPolicyKey(normalized.setting_key);
  }

  const suppliedValue = Object.prototype.hasOwnProperty.call(normalized, "policy_value")
    ? normalized.policy_value
    : normalized.value_json?.value;

  if (suppliedValue !== undefined) {
    const value = normalizeFinanceAccountingPolicyValue(suppliedValue);
    normalized.value_json = { value };
    delete normalized.policy_value;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "effective_from")) {
    normalized.effective_from = String(normalized.effective_from || "").slice(0, 10) || null;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "effective_to")) {
    normalized.effective_to = normalized.effective_to
      ? String(normalized.effective_to).slice(0, 10)
      : null;
  }

  normalized.status = String(normalized.status || "ACTIVE").trim().toUpperCase();
  return normalized;
}

export function validateAccountingPolicyPayload(payload = {}) {
  const candidate = normalizeAccountingPolicyPayload(payload);
  const definition = getFinanceAccountingPolicyDefinition(candidate.setting_key);
  if (!definition) throw new Error("Accounting Policy is not supported");

  const value = candidate.value_json?.value;
  if (!getFinanceAccountingPolicyOption(candidate.setting_key, value)) {
    throw new Error(`Policy Value is not valid for ${definition.name}`);
  }
  if (!candidate.effective_from) throw new Error("Effective From required");
  if (candidate.effective_to && candidate.effective_to < candidate.effective_from) {
    throw new Error("Effective To cannot be before Effective From");
  }
  if (!["ACTIVE", "ARCHIVED"].includes(candidate.status)) {
    throw new Error("Accounting Policy status is not supported");
  }

  return candidate;
}