import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function emitInventoryWasteEvent({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  wasteId,
  amount,
  department,
  reason,
  entryDate,
}) {
  const resolvedOrganizationId =
    organizationId ||
    organization_id;

  const resolvedEntityId =
    entityId ||
    entity_id ||
    null;

  if (!resolvedOrganizationId) {
    throw new Error("organizationId required");
  }

  return await financeGateway({
    type: "INVENTORY_WASTE",
    payload: {
      organization_id: resolvedOrganizationId,
      entity_id: resolvedEntityId,
      source_module: "inventory",
      source_id: wasteId,
      amount,
      department,
      reason,
      entryDate,
      description: "Inventory waste posting",
    },
  });
}
