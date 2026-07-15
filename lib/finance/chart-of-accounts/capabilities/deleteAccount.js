import { AccountRepository } from "../repositories/AccountRepository";

export async function deleteAccount({
  organizationId,
  entityId = null,
  accountId,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!accountId) {
    throw new Error("accountId required");
  }

  const account =
    await AccountRepository.get({
      organizationId,
      entityId,
      accountId,
    });

  if (!account) {
    throw new Error("Account not found");
  }

  if (
    account.is_system === true ||
    account.system_account === true
  ) {
    throw new Error(
      "System accounts cannot be deleted"
    );
  }

  const usage =
    await AccountRepository.countLedgerUsage({
      organizationId,
      accountId,
    });

  if (usage > 0) {
    throw new Error(
      "Account has posted transactions and cannot be deleted"
    );
  }

  return AccountRepository.remove({
    organizationId,
    entityId,
    accountId,
  });
}

export async function execute({
  context,
  payload,
}) {
  return deleteAccount({
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
      payload.row?.id,
  });
}
