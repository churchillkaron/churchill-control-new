import { AccountRepository } from "../repositories/AccountRepository";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";

export const manifest = defineCapability({
  domain: "finance",
  capability: "account",
  action: "listAccounts",
  description:
    "List the chart of accounts available to the active organization and legal entity.",
  permissions: [],
  events: [],
  tags: ["finance", "accounting", "chart-of-accounts", "read"],
  transactional: false,
  audiservice_unit: false,
  aiEnabled: false,
  operatorEnabled: true,
  operatorMode: "read",
  operatorAutoExecute: true,
  operatorRequiresConfirmation: false,
  risk: "low",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
});

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
