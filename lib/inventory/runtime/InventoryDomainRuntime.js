import { createInventoryItemsImportCapability } from "@/lib/inventory/runtime/InventoryOperatorCapability";
import { createPurchaseOrderCapability } from "@/lib/inventory/procurement/purchase-orders/PurchaseOrderOperatorCapability";
import { createGoodsReceiptCapability } from "@/lib/inventory/procurement/receiving/GoodsReceiptOperatorCapability";

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
    goods_receipts: {
      receive: async () => createGoodsReceiptCapability(),
    },
  },
};

export default InventoryDomainRuntime;
