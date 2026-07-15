import { AccountRepository } from "../repositories/AccountRepository";

export async function listAccounts({
  organizationId,
  entityId = null,
}) {
  return AccountRepository.list({
    organizationId,
    entityId,
  });
}

export async function execute({
  context,
  payload,
}) {
  return listAccounts({
    organizationId:
      context.organizationId,
    entityId:
      context.entityId ||
      payload.entityId ||
      payload.entity_id ||
      null,
  });
}
