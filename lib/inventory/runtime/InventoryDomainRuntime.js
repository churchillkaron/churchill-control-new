import { createInventoryItemsImportCapability } from "@/lib/inventory/runtime/InventoryOperatorCapability";
import { createPurchaseOrderCapability } from "@/lib/inventory/procurement/purchase-orders/PurchaseOrderOperatorCapability";
import { createGoodsReceiptCapability } from "@/lib/inventory/procurement/receiving/GoodsReceiptOperatorCapability";
import { createSupplierCapability } from "@/lib/inventory/procurement/suppliers/SupplierOperatorCapability";
import { createSupplierPriceImportCapability } from "@/lib/inventory/procurement/suppliers/SupplierPriceOperatorCapability";
import { createVendorInvoiceCostProjectionCapability } from "@/lib/inventory/costing/VendorInvoiceCostProjectionCapability";
import { createRecipeUpsertCapability } from "@/lib/inventory/production/RecipeOperatorCapability";
import { createProductionBatchCapability } from "@/lib/inventory/production/ProductionBatchOperatorCapability";
import { createPurchaseOrderReadCapability, createGoodsReceiptReadCapability, createSupplierReadCapability, createProductionBatchReadCapability } from "@/lib/inventory/runtime/SupplyChainVerificationReadCapabilities";

export const InventoryDomainRuntime = {
  domain: "supply-chain",
  name: "Supply Chain",
  version: "1.0.0",
  capabilities: {
    inventory_items: {
      import: async () => createInventoryItemsImportCapability(),
      verifyImport: async () => (await import("@/lib/inventory/runtime/InventoryItemsImportVerificationCapability")).createInventoryItemsImportVerificationCapability(),
    },
    purchase_orders: {
      create: async () => createPurchaseOrderCapability(),
      read: async () => createPurchaseOrderReadCapability(),
    },
    goods_receipts: {
      receive: async () => createGoodsReceiptCapability(),
      read: async () => createGoodsReceiptReadCapability(),
    },
    suppliers: {
      create: async () => createSupplierCapability(),
      read: async () => createSupplierReadCapability(),
    },
    supplier_prices: {
      import: async () => createSupplierPriceImportCapability(),
    },
    purchase_costs: {
      apply_vendor_invoice: async () => createVendorInvoiceCostProjectionCapability(),
    },
    recipes: {
      upsert: async () => createRecipeUpsertCapability(),
    },
    production_batches: {
      create: async () => createProductionBatchCapability(),
      read: async () => createProductionBatchReadCapability(),
    },
  },
};

export default InventoryDomainRuntime;
