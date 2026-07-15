import { AccountRepository } from "../repositories/AccountRepository";

const VALID_TYPES = new Set([
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);

export async function upsertAccount({
  organizationId,
  entityId = null,
  accountId = null,
  values = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!values.account_code?.trim()) {
    throw new Error("account_code required");
  }

  if (!values.account_name?.trim()) {
    throw new Error("account_name required");
  }

  if (!VALID_TYPES.has(values.account_type)) {
    throw new Error("Valid account_type required");
  }

  const duplicate =
    await AccountRepository.findByCode({
      organizationId,
      entityId,
      accountCode:
        values.account_code.trim(),
      excludeId: accountId,
    });

  if (duplicate) {
    throw new Error(
      `Account code ${values.account_code} already exists`
    );
  }

  return AccountRepository.upsert({
    organizationId,
    entityId,
    accountId,
    values: {
      ...values,
      account_code:
        values.account_code.trim(),
      account_name:
        values.account_name.trim(),
    },
  });
}

export async function execute({
  context,
  payload,
}) {
  return upsertAccount({
    organizationId:
      context.organizationId,
    entityId:
      context.entityId ||
      payload.entityId ||
      payload.entity_id ||
      null,
    accountId:
      payload.id ||
      payload.accountId ||
      null,
    values: payload,
  });
}
