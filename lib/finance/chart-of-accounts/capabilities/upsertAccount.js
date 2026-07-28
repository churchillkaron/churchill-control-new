import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { AccountRepository } from "../repositories/AccountRepository";

const VALID_TYPES = new Set([
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
]);

const VALID_CATEGORIES = new Set([
  "CASH",
  "CURRENT_ASSET",
  "NON_CURRENT_ASSET",
  "CURRENT_LIABILITY",
  "NON_CURRENT_LIABILITY",
  "EQUITY",
  "REVENUE",
  "COST_OF_SALES",
  "OPERATING_EXPENSE",
  "OTHER_INCOME",
  "OTHER_EXPENSE",
]);

const CATEGORY_TYPES = Object.freeze({
  CASH: "ASSET",
  CURRENT_ASSET: "ASSET",
  NON_CURRENT_ASSET: "ASSET",
  CURRENT_LIABILITY: "LIABILITY",
  NON_CURRENT_LIABILITY: "LIABILITY",
  EQUITY: "EQUITY",
  REVENUE: "REVENUE",
  OTHER_INCOME: "REVENUE",
  COST_OF_SALES: "EXPENSE",
  OPERATING_EXPENSE: "EXPENSE",
  OTHER_EXPENSE: "EXPENSE",
});

const VALID_NORMAL_BALANCES = new Set(["DEBIT", "CREDIT"]);

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

export async function upsertAccount({
  organizationId,
  entityId,
  accountId = null,
  values = {},
}) {
  const organization_id = required(organizationId, "organizationId");
  const entity_id = required(entityId, "entityId");

  const entity = await resolveEntity({
    organizationId: organization_id,
    entityId: entity_id,
  });
  if (!entity) {
    throw new Error("Legal entity not found in organisation");
  }

  const account_code = required(values.account_code, "account_code");
  const account_name = required(values.account_name, "account_name");
  const account_type = required(values.account_type, "account_type").toUpperCase();
  const account_category = required(
    values.account_category,
    "account_category"
  ).toUpperCase();
  const normal_balance = required(
    values.normal_balance,
    "normal_balance"
  ).toUpperCase();
  const currency_code = required(
    values.currency_code,
    "currency_code"
  ).toUpperCase();

  if (!VALID_TYPES.has(account_type)) {
    throw new Error("Valid account_type required");
  }
  if (!VALID_CATEGORIES.has(account_category)) {
    throw new Error("Valid account_category required");
  }
  if (CATEGORY_TYPES[account_category] !== account_type) {
    throw new Error("Account category does not match account type");
  }
  if (!VALID_NORMAL_BALANCES.has(normal_balance)) {
    throw new Error("normal_balance must be DEBIT or CREDIT");
  }
  if (!/^[A-Z]{3}$/.test(currency_code)) {
    throw new Error("currency_code must be a valid configured currency code");
  }

  const duplicate = await AccountRepository.findByCode({
    organizationId: organization_id,
    entityId: entity.id,
    accountCode: account_code,
    excludeId: accountId,
  });
  if (duplicate) {
    throw new Error(`Account code ${account_code} already exists`);
  }

  const parent_account_id = values.parent_account_id || null;
  if (parent_account_id) {
    if (parent_account_id === accountId) {
      throw new Error("Account cannot be its own parent");
    }

    const parent = await AccountRepository.get({
      organizationId: organization_id,
      entityId: entity.id,
      accountId: parent_account_id,
    });
    if (!parent) {
      throw new Error("Parent account not found in selected legal entity");
    }
  }

  if (accountId) {
    const existing = await AccountRepository.get({
      organizationId: organization_id,
      entityId: entity.id,
      accountId,
    });
    if (!existing) {
      throw new Error("Account not found in selected legal entity");
    }
    if (existing.is_system === true && values.is_active === false) {
      throw new Error("System accounts cannot be deactivated");
    }
  }

  return AccountRepository.upsert({
    organizationId: organization_id,
    entityId: entity.id,
    accountId,
    values: {
      account_code,
      account_name,
      account_type,
      account_category,
      parent_account_id,
      normal_balance,
      currency_code,
      is_active: values.is_active !== false,
    },
  });
}

export async function execute({ context, payload }) {
  return upsertAccount({
    organizationId: context.organizationId,
    entityId:
      context.entityId ||
      payload.entityId ||
      payload.entity_id,
    accountId:
      payload.id ||
      payload.accountId ||
      null,
    values: payload,
  });
}
