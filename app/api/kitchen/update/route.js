export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

import { createCogsEntry } from "@/lib/finance/createCogsEntry";

import { consumeDishStock } from "@/lib/production/consumeDishStock";

export async function POST(req) {

  try {

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {

      return Response.json(
        {
          error:
            "Missing Supabase environment variables",
        },
        { status: 500 }
      );

    }

    const supabase = createClient(
      supabaseUrl,
      serviceKey
    );

    const {
      order_id,
      status,
      tenant_id,
    } = await req.json();

    if (!tenant_id) {

      return Response.json(
        {
          error: "Missing tenant_id",
        },
        { status: 400 }
      );

    }

    if (!order_id || !status) {

      return Response.json(
        {
          error: "Missing data",
        },
        { status: 400 }
      );

    }

    // =========================
    // KITCHEN STATUS ONLY
    // =========================

    // IMPORTANT:
    // Kitchen must NEVER close order.
    // Payment lifecycle is separate.

    const kitchenStatus =
      status === "done"
        ? "ready"
        : status;

    const {
      error: updateError,
    } = await supabase
      .from("orders")
      .update({
        kitchen_status:
          kitchenStatus,
      })
      .eq("id", order_id)
      .eq(
        "tenant_id",
        tenant_id
      );

    if (updateError)
      throw updateError;

    // =========================
    // SALES CONSUMPTION
    // ONLY WHEN KITCHEN DONE
    // =========================

    if (status === "done") {

      const {
        data: items,
        error: itemsError,
      } = await supabase
        .from("order_items")
        .select(`
          dish_id,
          quantity,
          price
        `)
        .eq(
          "order_id",
          order_id
        )
        .eq(
          "tenant_id",
          tenant_id
        );

      if (itemsError)
        throw itemsError;

      // =========================
      // GROUP ITEMS
      // =========================

      const groupedItems = {};

      for (const item of items || []) {

        const key =
          item.dish_id;

        if (
          !groupedItems[key]
        ) {

          groupedItems[key] = {
            dish_id:
              item.dish_id,
            quantity: 0,
            revenue: 0,
          };

        }

        groupedItems[
          key
        ].quantity += Number(
          item.quantity || 0
        );

        groupedItems[
          key
        ].revenue +=
          Number(
            item.price || 0
          ) *
          Number(
            item.quantity || 0
          );

      }

      // =========================
      // PROCESS GROUPED ITEMS
      // =========================

      for (const groupedItem of Object.values(
        groupedItems
      )) {

        // =========================
        // DISH STOCK DEDUCTION
        // =========================

        const stockResult =
          await consumeDishStock({
            tenantId:
              tenant_id,
            dishId:
              groupedItem.dish_id,
            quantity:
              Number(
                groupedItem.quantity
              ),
            referenceId:
              order_id,
            source:
              "ORDER_COMPLETED",
          });

        if (
          !stockResult.success
        ) {

          return Response.json(
            {
              error:
                "Stock deduction failed",
              detail:
                stockResult.error,
            },
            { status: 500 }
          );

        }

        // =========================
        // COGS ENTRY
        // =========================

        const cogsResult =
          await createCogsEntry({
            tenantId:
              tenant_id,
            orderId:
              order_id,
            dishId:
              groupedItem.dish_id,
            quantity:
              Number(
                groupedItem.quantity
              ),
            revenueAmount:
              Number(
                groupedItem.revenue
              ),
          });

        if (
          !cogsResult.success
        ) {

          console.error(
            "COGS CREATION FAILED:",
            JSON.stringify(
              cogsResult,
              null,
              2
            )
          );

        }

      }

    }

    return Response.json({
      success: true,
    });

  } catch (err) {

    console.error(
      "KITCHEN ERROR:",
      err
    );

    return Response.json(
      {
        error:
          err.message ||
          "Kitchen error",
      },
      { status: 500 }
    );

  }

}
