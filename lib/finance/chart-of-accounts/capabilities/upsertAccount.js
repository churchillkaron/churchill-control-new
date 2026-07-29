import { AccountRepository } from "../repositories/AccountRepository";

const VALID_TYPES = new Set([
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
]);

const TYPE_ALIASES = Object.freeze({
  ASSET: "ASSET",
  "CURRENT ASSET": "ASSET",
  "NON CURRENT ASSET": "ASSET",
  "NON-CURRENT ASSET": "ASSET",
  LIABILITY: "LIABILITY",
  "CURRENT LIABILITY": "LIABILITY",
  "NON CURRENT LIABILITY": "LIABILITY",
  "NON-CURRENT LIABILITY": "LIABILITY",
  EQUITY: "EQUITY",
  REVENUE: "REVENUE",
  "OTHER REVENUE": "REVENUE",
  "OTHER INCOME": "REVENUE",
  EXPENSE: "EXPENSE",
  EXPENSES: "EXPENSE",
  "OPERATING EXPENSE": "EXPENSE",
  "OTHER EXPENSE": "EXPENSE",
  "COST OF SALES": "EXPENSE",
  COGS: "EXPENSE",
});

const CATEGORY_ALIASES = Object.freeze({
  ASSET: "ASSET",
  ASSETS: "ASSET",
  LIABILITY: "LIABILITY",
  LIABILITIES: "LIABILITY",
  EQUITY: "EQUITY",
  REVENUE: "REVENUE",
  "OTHER INCOME": "OTHER_INCOME",
  "COST OF SALES": "COST_OF_SALES",
  EXPENSE: "EXPENSE",
  EXPENSES: "EXPENSE",
  "OTHER EXPENSE": "OTHER_EXPENSE",
});

function normalizedKey(value) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizeType(value) {
  return TYPE_ALIASES[normalizedKey(value)] || null;
}

function normalizeCategory(value) {
  const key = normalizedKey(value);
  return CATEGORY_ALIASES[key] || key.replace(/\s+/g, "_") || null;
}

function normalizeNormalBalance(value, accountType) {
  const normalized = normalizedKey(value);
  if (normalized === "DEBIT" || normalized === "CREDIT") return normalized;
  return ["ASSET", "EXPENSE"].includes(accountType) ? "DEBIT" : "CREDIT";
}

export async function upsertAccount({
  organizationId,
  entityId = null,
  accountId = null,
  values = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const accountCode = String(values.account_code || "").trim();
  const accountName = String(values.account_name || "").trim();
  const accountType = normalizeType(values.account_type);

  if (!accountCode) {
    throw new Error("account_code required");
  }

  if (!accountName) {
    throw new Error("account_name required");
  }

  if (!accountType || !VALID_TYPES.has(accountType)) {
    throw new Error("Select a valid Account Type");
  }

  const duplicate = await AccountRepository.findByCode({
    organizationId,
    entityId,
    accountCode,
    excludeId: accountId,
  });

  if (duplicate) {
    throw new Error(`Account code ${accountCode} already exists`);
  }

  return AccountRepository.upsert({
    organizationId,
    entityId,
    accountId,
    values: {
      ...values,
      account_code: accountCode,
      account_name: accountName,
      account_type: accountType,
      account_category: normalizeCategory(values.account_category || accountType),
      normal_balance: normalizeNormalBalance(values.normal_balance, accountType),
    },
  });
}

export async function execute({ context, payload }) {
  return upsertAccount({
    organizationId: context.organizationId,
    entityId:
      context.entityId ||
      payload.entityId ||
      payload.entity_id ||
      null,
    accountId: payload.id || payload.accountId || null,
    values: payload,
  });
}
