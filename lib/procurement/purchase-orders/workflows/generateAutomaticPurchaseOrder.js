import analyzeReplenishmentNeeds from "@/lib/procurement/replenishment/workflows/analyzeReplenishmentNeeds";
import getBestSupplierPrice from "@/lib/procurement/pricing/capabilities/getBestSupplierPrice";
import createPurchaseOrder from "@/lib/procurement/purchase-orders/createPurchaseOrder";

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

    const replenishment =
      await analyzeReplenishmentNeeds({
        organizationId: resolvedOrganizationId,
      });

    if (!replenishment.success) {
      throw new Error(replenishment.error);
    }

    const groupedByVendor = {};

    for (const recommendation of replenishment.recommendations || []) {

      const supplier =
        await getBestSupplierPrice({
          ingredient_id:
            recommendation.ingredient_id,
        });

      if (!supplier.success) {
        continue;
      }

      const vendorId =
        supplier.best_supplier.vendor_id;

      if (!groupedByVendor[vendorId]) {
        groupedByVendor[vendorId] = [];
      }

      groupedByVendor[vendorId].push({
        ingredient_id:
          recommendation.ingredient_id,
        ingredient_name:
          recommendation.ingredient,
        quantity:
          recommendation.recommended_purchase,
        price:
          supplier.best_supplier.price,
      });
    }

    const purchaseOrders = [];

    for (const vendorId of Object.keys(groupedByVendor)) {

      const po =
        await createPurchaseOrder({
          organizationId:
            resolvedOrganizationId,
          entityId:
            resolvedEntityId,
          vendor_id:
            vendorId,
          items:
            groupedByVendor[vendorId],
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
