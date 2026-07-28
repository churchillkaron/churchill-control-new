import { AccountRepository } from "../repositories/AccountRepository";

export async function deleteAccount({
  organizationId,
  entityId,
  accountId,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }
  if (!entityId) {
    throw new Error("entityId required");
  }
  if (!accountId) {
    throw new Error("accountId required");
  }

  const account = await AccountRepository.get({
    organizationId,
    entityId,
    accountId,
  });

  if (!account) {
    throw new Error("Account not found in selected legal entity");
  }
  if (account.is_system === true || account.system_account === true) {
    throw new Error("System accounts cannot be archived");
  }
  if (account.is_active === false) {
    return account;
  }

  return AccountRepository.archive({
    organizationId,
    entityId,
    accountId,
  });
}

export async function execute({ context, payload }) {
  return deleteAccount({
    organizationId: context.organizationId,
    entityId:
      context.entityId ||
      payload.entityId ||
      payload.entity_id,
    accountId:
      payload.id ||
      payload.accountId ||
      payload.row?.id,
  });
}
