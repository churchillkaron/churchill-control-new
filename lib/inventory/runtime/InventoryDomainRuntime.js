import { createInventoryItemsImportCapability } from "@/lib/inventory/runtime/InventoryOperatorCapability";
import { createPurchaseOrderCapability } from "@/lib/inventory/procurement/purchase-orders/PurchaseOrderOperatorCapability";

export const InventoryDomainRuntime = {
  domain: "supply-chain",
  name: "Supply Chain",
  version: "1.0.0",
  capabilities: {
    inventory_items: {
      import: async () => createInventoryItemsImportCapability(),
    },
    purchase_orders: {
      create: async () => createPurchaseOrderCapability(),
    },
  },
};

export default InventoryDomainRuntime;
