import analyzeReplenishmentNeeds from "@/lib/procurement/replenishment/workflows/analyzeReplenishmentNeeds";

import getBestSupplierPrice from "@/lib/procurement/pricing/capabilities/getBestSupplierPrice";

import createPurchaseOrder from "@/lib/procurement/purchase-orders/createPurchaseOrder";

export default async function generateAutomaticPurchaseOrder({
  tenant_id,
}) {

  try {

    const replenishment =
      await analyzeReplenishmentNeeds({

        tenant_id,
      });

    if (
      !replenishment.success
    ) {

      throw new Error(
        replenishment.error
      );
    }

    const groupedByVendor = {};

    for (const recommendation of replenishment.recommendations || []) {

      const bestSupplier =
        await getBestSupplierPrice({

          ingredient_id:
            recommendation.ingredient_id,
        });

      if (
        !bestSupplier.success
      ) {

        continue;
      }

      const supplier =
        bestSupplier.best_supplier;

      const vendorId =
        supplier.vendor_id;

      if (
        !groupedByVendor[
          vendorId
        ]
      ) {

        groupedByVendor[
          vendorId
        ] = [];
      }

      groupedByVendor[
        vendorId
      ].push({

        ingredient_id:
          recommendation.ingredient_id,

        ingredient_name:
          recommendation.ingredient,

        quantity:
          recommendation.recommended_purchase,

        price:
          supplier.price,
      });
    }

    const purchaseOrders = [];

    for (const vendorId of Object.keys(
      groupedByVendor
    )) {

      const po =
        await createPurchaseOrder({

          tenant_id,

          vendor_id:
            vendorId,

          items:
            groupedByVendor[
              vendorId
            ],

          created_by:
            "AUTO_SYSTEM",
        });

      purchaseOrders.push(
        po
      );
    }

    return {

      success: true,

      purchase_orders:
        purchaseOrders,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
