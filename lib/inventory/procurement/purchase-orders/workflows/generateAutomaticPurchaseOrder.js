import analyzeReplenishmentNeeds from "@/lib/inventory/procurement/replenishment/workflows/analyzeReplenishmentNeeds";
import getBestSupplierPrice from "@/lib/inventory/procurement/pricing/capabilities/getBestSupplierPrice";
import createPurchaseOrder from "@/lib/inventory/procurement/purchase-orders/createPurchaseOrder";

export default async function generateAutomaticPurchaseOrder({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
}) {
  try {

    const resolvedOrganizationId =
      organizationId || organization_id;

    const resolvedEntityId =
      entityId || entity_id || null;

    if (!resolvedOrganizationId) {
      throw new Error("organization_id required");
    }

    if (!resolvedEntityId) {
      throw new Error("entity_id required");
    }

    const replenishment =
      await analyzeReplenishmentNeeds({
        organizationId: resolvedOrganizationId,
        entityId: resolvedEntityId,
      });

    if (!replenishment.success) {
      throw new Error(replenishment.error);
    }

    const groupedBySupplier = {};

    for (const recommendation of replenishment.recommendations || []) {

      const supplier =
        await getBestSupplierPrice({
          item_id:
            recommendation.item_id,
          organizationId:
            resolvedOrganizationId,
          entityId:
            resolvedEntityId,
        });

      if (!supplier.success) {
        continue;
      }

      const supplierPartyId =
        supplier.best_supplier.supplier_party_id;

      if (!groupedBySupplier[supplierPartyId]) {
        groupedBySupplier[supplierPartyId] = [];
      }

      groupedBySupplier[supplierPartyId].push({
        item_id:
          recommendation.item_id,
        item_name:
          recommendation.ingredient,
        quantity:
          recommendation.recommended_purchase,
        price:
          supplier.best_supplier.price,
      });
    }

    const purchaseOrders = [];

    for (const supplierPartyId of Object.keys(groupedBySupplier)) {

      const po =
        await createPurchaseOrder({
          organizationId:
            resolvedOrganizationId,
          entityId:
            resolvedEntityId,
          supplier_party_id:
            supplierPartyId,
          items:
            groupedBySupplier[supplierPartyId],
          ordered_by:
            "AUTO_SYSTEM",
        });

      purchaseOrders.push(po);
    }

    return {
      success: true,
      purchase_orders: purchaseOrders,
    };

  } catch (error) {

    return {
      success: false,
      error: error.message,
    };

  }
}
