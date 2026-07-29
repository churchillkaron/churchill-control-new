import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  FINANCE_ACCOUNTING_POLICY_DEFINITIONS,
} from "@/lib/finance/accounting-settings/FinanceAccountingPolicyDefinitions";

const COST_CENTER_POLICY_KEYS = Object.freeze([
  "COST_CENTER_CODE_MODE",
  "COST_CENTER_DEPARTMENT_MODE",
  "COST_CENTER_OWNER_MODE",
  "COST_CENTER_TYPE_MODE",
  "COST_CENTER_DEFAULT_TYPE",
  "COST_CENTER_HIERARCHY_MODE",
  "COST_CENTER_DESCRIPTION_MODE",
]);

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function policyValue(valueJson) {
  if (!valueJson) return null;
  if (typeof valueJson === "object") return text(valueJson.value)?.toUpperCase() || null;
  try {
    return text(JSON.parse(valueJson)?.value)?.toUpperCase() || null;
  } catch {
    return text(valueJson)?.toUpperCase() || null;
  }
}

function defaultConfiguration() {
  return Object.fromEntries(
    COST_CENTER_POLICY_KEYS.map((key) => [
      key,
      FINANCE_ACCOUNTING_POLICY_DEFINITIONS[key].defaultValue,
    ])
  );
}

export async function resolveCostCenterConfiguration({ organizationId }) {
  if (!organizationId) throw new Error("organizationId required");

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("finance_accounting_settings")
    .select("setting_key, value_json, effective_from, effective_to, status")
    .eq("organization_id", organizationId)
    .in("setting_key", COST_CENTER_POLICY_KEYS)
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .or("status.is.null,status.eq.ACTIVE,status.eq.active")
    .order("effective_from", { ascending: false });

  if (error) throw error;

  const configuration = defaultConfiguration();
  const resolved = new Set();
  for (const row of data || []) {
    const key = text(row.setting_key)?.toUpperCase();
    if (!key || resolved.has(key) || !configuration[key]) continue;
    const value = policyValue(row.value_json);
    const definition = FINANCE_ACCOUNTING_POLICY_DEFINITIONS[key];
    if (definition?.options.some((option) => option.value === value)) {
      configuration[key] = value;
      resolved.add(key);
    }
  }

  return Object.freeze(configuration);
}

function generateCode(name) {
  const code = String(name || "")
    .trim()
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  if (!code) throw new Error("Cost Centre Name must produce a valid code");
  return code;
}

function requireValue(value, message) {
  if (!text(value)) throw new Error(message);
}

export async function applyCostCenterConfiguration({
  organizationId,
  payload = {},
  isCreate = false,
}) {
  const configuration = await resolveCostCenterConfiguration({ organizationId });
  const normalized = { ...payload };

  if (
    configuration.COST_CENTER_CODE_MODE === "AUTO_FROM_NAME" &&
    (isCreate || !text(normalized.code))
  ) {
    normalized.code = generateCode(normalized.name);
  }

  const departmentId = normalized.department_id ?? normalized.departmentId;
  if (configuration.COST_CENTER_DEPARTMENT_MODE === "REQUIRED") {
    requireValue(departmentId, "Department required by Cost Centre configuration");
  } else if (configuration.COST_CENTER_DEPARTMENT_MODE === "HIDDEN") {
    normalized.department_id = null;
    normalized.departmentId = null;
  }

  const ownerId = normalized.manager_user_id ?? normalized.managerUserId;
  if (configuration.COST_CENTER_OWNER_MODE === "REQUIRED") {
    requireValue(ownerId, "Responsible Owner required by Cost Centre configuration");
  } else if (configuration.COST_CENTER_OWNER_MODE === "HIDDEN") {
    normalized.manager_user_id = null;
    normalized.managerUserId = null;
  }

  if (configuration.COST_CENTER_TYPE_MODE === "REQUIRED") {
    requireValue(normalized.type, "Cost Centre Type required by Cost Centre configuration");
  }
  if (
    configuration.COST_CENTER_TYPE_MODE === "HIDDEN" ||
    !text(normalized.type)
  ) {
    normalized.type = configuration.COST_CENTER_DEFAULT_TYPE;
  }

  const parentId = normalized.parent_cost_center_id ?? normalized.parentCostCenterId;
  if (configuration.COST_CENTER_HIERARCHY_MODE === "REQUIRED") {
    requireValue(parentId, "Parent Cost Centre required by Cost Centre configuration");
  } else if (configuration.COST_CENTER_HIERARCHY_MODE === "DISABLED") {
    normalized.parent_cost_center_id = null;
    normalized.parentCostCenterId = null;
  }

  if (configuration.COST_CENTER_DESCRIPTION_MODE === "DISABLED") {
    normalized.description = null;
  }

  return { payload: normalized, configuration };
}

export function buildCostCenterFormSchema(configuration = defaultConfiguration()) {
  const fields = [
    {
      name: "name",
      label: "Cost Centre Name",
      type: "text",
      required: true,
      placeholder: "Example: Kitchen",
    },
  ];

  if (configuration.COST_CENTER_CODE_MODE === "MANUAL") {
    fields.push({
      name: "code",
      label: "Cost Centre Code",
      type: "text",
      required: true,
      placeholder: "Example: KITCHEN",
    });
  }

  if (configuration.COST_CENTER_DEPARTMENT_MODE !== "HIDDEN") {
    fields.push({
      name: "department_id",
      label: "Department",
      type: "lookup",
      lookup: "departments",
      requireEntity: true,
      required: configuration.COST_CENTER_DEPARTMENT_MODE === "REQUIRED",
    });
  }

  if (configuration.COST_CENTER_OWNER_MODE !== "HIDDEN") {
    fields.push({
      name: "manager_user_id",
      label: "Responsible Owner",
      type: "lookup",
      lookup: "employees",
      required: configuration.COST_CENTER_OWNER_MODE === "REQUIRED",
    });
  }

  if (configuration.COST_CENTER_TYPE_MODE !== "HIDDEN") {
    fields.push({
      name: "type",
      label: "Cost Centre Type",
      type: "select",
      required: configuration.COST_CENTER_TYPE_MODE === "REQUIRED",
      defaultValue: configuration.COST_CENTER_DEFAULT_TYPE,
      options: FINANCE_ACCOUNTING_POLICY_DEFINITIONS.COST_CENTER_DEFAULT_TYPE.options,
    });
  }

  if (configuration.COST_CENTER_HIERARCHY_MODE !== "DISABLED") {
    fields.push({
      name: "parent_cost_center_id",
      label: "Parent Cost Centre",
      type: "lookup",
      lookup: "cost_centers",
      requireEntity: true,
      required: configuration.COST_CENTER_HIERARCHY_MODE === "REQUIRED",
    });
  }

  if (configuration.COST_CENTER_DESCRIPTION_MODE === "ENABLED") {
    fields.push({
      name: "description",
      label: "Description",
      type: "textarea",
      rows: 2,
      width: "full",
    });
  }

  return fields;
}
