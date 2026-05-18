import generateAutomaticPurchaseOrder from "@/lib/procurement/automation/generateAutomaticPurchaseOrder";

export default async function runAutonomousProcurement({
  tenant_id,
  ai_finance,
  monitoring,
}) {

  try {

    // ===== PROCUREMENT BLOCK =====
    if (
      ai_finance.procurement_decision ===
      "RESTRICT_PROCUREMENT"
    ) {

      return {

        success: true,

        blocked: true,

        reason:
          "PROCUREMENT_RESTRICTED_BY_AI_CFO",
      };
    }

    // ===== LOW STOCK =====
    if (
      monitoring.low_stock_items > 0
    ) {

      const po =
        await generateAutomaticPurchaseOrder({

          tenant_id,
        });

      return {

        success: true,

        autonomous_action:
          "PURCHASE_ORDER_GENERATED",

        purchase_orders:
          po.purchase_orders || [],
      };
    }

    return {

      success: true,

      autonomous_action:
        "NO_ACTION_REQUIRED",
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
