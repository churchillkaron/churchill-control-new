import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildAINegotiationAgent({
  tenant_id,
}) {

  try {

    const {
      data: purchaseOrders,
      error,
    } = await supabaseAdmin
      .from("purchase_orders")
      .select(`
        id,
        supplier_name,
        item_name,
        quantity,
        total_amount,
        priority,
        created_at
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .limit(5000);

    if (error) {
      throw error;
    }

    const negotiations = [];

    for (const po of purchaseOrders || []) {

      const amount =
        Number(
          po.total_amount || 0
        );

      let leverage =
        "LOW";

      let targetDiscount =
        3;

      let strategy =
        "Maintain supplier relationship.";

      if (
        amount > 10000
      ) {

        leverage =
          "MEDIUM";

        targetDiscount =
          7;

        strategy =
          "Negotiate volume pricing.";
      }

      if (
        amount > 50000
      ) {

        leverage =
          "HIGH";

        targetDiscount =
          12;

        strategy =
          "Use multi-supplier leverage and long-term contract negotiation.";
      }

      if (
        po.priority ===
        "HIGH"
      ) {

        strategy +=
          " Prioritize delivery guarantees.";
      }

      const projectedSavings =
        Number(
          (
            amount *
            (
              targetDiscount / 100
            )
          ).toFixed(2)
        );

      negotiations.push({

        purchase_order_id:
          po.id,

        supplier:
          po.supplier_name,

        item:
          po.item_name,

        amount,

        leverage,

        target_discount:
          targetDiscount,

        projected_savings:
          projectedSavings,

        strategy,
      });
    }

    const totalSavings =
      negotiations.reduce(
        (
          sum,
          item
        ) =>
          sum +
          item.projected_savings,
        0
      );

    return {

      success: true,

      total_negotiations:
        negotiations.length,

      projected_total_savings:
        Number(
          totalSavings.toFixed(2)
        ),

      negotiations:
        negotiations.slice(
          0,
          200
        ),

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
