import { createInventoryItemsImportCapability } from "@/lib/inventory/runtime/InventoryOperatorCapability";

export const InventoryDomainRuntime = {
  domain: "supply-chain",
  name: "Supply Chain",
  version: "1.0.0",
  capabilities: {
    inventory_items: {
      import: async () => createInventoryItemsImportCapability(),
    },
  },
};

export default InventoryDomainRuntime;
