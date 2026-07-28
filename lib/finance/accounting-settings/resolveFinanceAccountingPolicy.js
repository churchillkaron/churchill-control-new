import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  getFinanceAccountingPolicyDefinition,
  getFinanceAccountingPolicyOption,
  normalizeFinanceAccountingPolicyKey,
  normalizeFinanceAccountingPolicyValue,
} from "./FinanceAccountingPolicyDefinitions";

function normalizeDate(value) {
  const candidate = value ? new Date(value) : new Date();

  if (Number.isNaN(candidate.getTime())) {
    throw new Error("effectiveDate must be a valid date");
  }

  return candidate.toISOString().slice(0, 10);
}

function extractPolicyValue(valueJson) {
  if (valueJson && typeof valueJson === "object") {
    return normalizeFinanceAccountingPolicyValue(valueJson.value);
  }

  if (typeof valueJson === "string") {
    try {
      const parsed = JSON.parse(valueJson);
      return normalizeFinanceAccountingPolicyValue(parsed?.value);
    } catch {
      return normalizeFinanceAccountingPolicyValue(valueJson);
    }
  }

  return "";
}

export async function resolveFinanceAccountingPolicy({
  organizationId,
  settingKey,
  effectiveDate = null,
}) {
  if (!organizationId) throw new Error("organizationId required");

  const normalizedKey = normalizeFinanceAccountingPolicyKey(settingKey);
  const definition = getFinanceAccountingPolicyDefinition(normalizedKey);

  if (!definition) {
    throw new Error(`Unsupported Finance accounting policy: ${normalizedKey}`);
  }

  const resolvedDate = normalizeDate(effectiveDate);
  const { data, error } = await supabaseAdmin
    .from("finance_accounting_settings")
    .select("id, setting_key, name, value_json, effective_from, effective_to, status")
    .eq("organization_id", organizationId)
    .eq("setting_key", normalizedKey)
    .eq("status", "ACTIVE")
    .lte("effective_from", resolvedDate)
    .or(`effective_to.is.null,effective_to.gte.${resolvedDate}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const resolvedValue = data
    ? extractPolicyValue(data.value_json)
    : definition.defaultValue;
  const option = getFinanceAccountingPolicyOption(normalizedKey, resolvedValue);

  if (!option) {
    throw new Error(
      `Invalid active value configured for Finance accounting policy ${normalizedKey}`
    );
  }

  return Object.freeze({
    key: normalizedKey,
    name: definition.name,
    value: option.value,
    label: option.label,
    effectiveDate: resolvedDate,
    source: data ? "CONFIGURED" : "DEFAULT",
    recordId: data?.id || null,
  });
}

export async function resolveFinanceAccountingPolicies({
  organizationId,
  effectiveDate = null,
}) {
  const [postingDateBasis, systemJournalType, journalReferenceFormat] =
    await Promise.all([
      resolveFinanceAccountingPolicy({
        organizationId,
        settingKey: "POSTING_DATE_BASIS",
        effectiveDate,
      }),
      resolveFinanceAccountingPolicy({
        organizationId,
        settingKey: "SYSTEM_JOURNAL_TYPE",
        effectiveDate,
      }),
      resolveFinanceAccountingPolicy({
        organizationId,
        settingKey: "JOURNAL_REFERENCE_FORMAT",
        effectiveDate,
      }),
    ]);

  return Object.freeze({
    postingDateBasis,
    systemJournalType,
    journalReferenceFormat,
  });
}

export default resolveFinanceAccountingPolicy;
