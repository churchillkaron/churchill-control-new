export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

import { createCogsEntry } from "@/lib/finance/createCogsEntry";

import { consumeDishStock } from "@/lib/production/consumeDishStock";

import { createAlert } from "@/lib/alerts/createAlert";

export async function POST(req) {

  try {

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (
      !supabaseUrl ||
      !serviceKey
    ) {

      return Response.json(
        {
          error:
            "Missing Supabase environment variables",
        },
        {
          status: 500,
        }
      );

    }

    const supabase =
      createClient(
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
          error:
            "Missing tenant_id",
        },
        {
          status: 400,
        }
      );

    }

    if (
      !order_id ||
      !status
    ) {

      return Response.json(
        {
          error:
            "Missing data",
        },
        {
          status: 400,
        }
      );

    }

    // =========================
    // UPDATE ORDER STATUS
    // =========================

    const {
      error: updateError,
    } = await supabase

      .from("orders")

      .update({
        kitchen_status:
          "ready",
      })

      .eq(
        "id",
        order_id
      )

      .eq(
        "tenant_id",
        tenant_id
      );

    if (updateError)
      throw updateError;

    // =========================
    // SALES CONSUMPTION
    // =========================

    if (
      status === "done"
    ) {

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

        groupedItems[key]
          .quantity +=
          Number(
            item.quantity || 1
          );

        groupedItems[key]
          .revenue +=
          Number(
            item.price || 0
          ) *
          Number(
            item.quantity || 1
          );

      }

      // =========================
      // PROCESS GROUPED DISHES
      // =========================

      for (const key in groupedItems) {
        console.log(
  "ENTERING GROUP LOOP"
);

        const item =
          groupedItems[key];

        // =========================
        // DISH STOCK DEDUCTION
        // =========================
console.log(
  "BEFORE STOCK CONSUMPTION"
);
        const stockResult =
          await consumeDishStock({

            tenantId:
              tenant_id,

            dishId:
              item.dish_id,

            quantity:
              Number(
                item.quantity || 1
              ),

            referenceId:
              order_id,

            source:
              "ORDER_COMPLETED",

          });

          console.log(
  "AFTER STOCK CONSUMPTION"
);

        console.log(
          "KITCHEN STOCK CONSUMED"
        );

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
            {
              status: 500,
            }
          );

        }

        // =========================
        // LOW STOCK ALERTS
        // =========================

        const {
  data: recipeItems,
  error: recipeError,
} = await supabase

  .from("recipe_items")

  .select(`
    ingredient_id
  `)

  .eq(
    "dish_id",
    item.dish_id
  )

  .eq(
    "tenant_id",
    tenant_id
  );

console.log(
  "RECIPE ITEMS:",
  recipeItems
);

console.log(
  "RECIPE ERROR:",
  recipeError
);

if (recipeError) {

  console.error(
    "RECIPE LOAD FAILED:",
    recipeError
  );

} else {

  console.log(
    "RECIPE LOADED"
  );

}

        for (
          const recipeItem of
          recipeItems || []
        ) {

          const {
            data: stockData,
          } = await supabase

            .from(
              "ingredient_stock"
            )

            .select(`
              quantity
            `)

            .eq(
              "tenant_id",
              tenant_id
            )

            .eq(
              "ingredient_id",
              recipeItem.ingredient_id
            )

            .single();

          const {
            data: ingredientData,
          } = await supabase

            .from("ingredients")

            .select(`
              name
            `)

            .eq(
              "id",
              recipeItem.ingredient_id
            )

            .single();

          console.log(
            "STOCK DATA:",
            stockData
          );

          const remainingQty =
            parseFloat(
              stockData?.quantity ?? 0
            );

          console.log(
            "REMAINING STOCK:",
            remainingQty
          );

          if (
            remainingQty <= 10
          ) {

            console.log(
              "LOW STOCK TRIGGERED",
              ingredientData?.name,
              remainingQty
            );

            await createAlert({

              tenantId:
                tenant_id,

              alertType:
                "LOW_STOCK",

              severity:
                remainingQty <= 3
                  ? "CRITICAL"
                  : "WARNING",

              title:
                "Low Ingredient Stock",

              message:
                `${ingredientData?.name || "Ingredient"} is running low (${remainingQty} remaining)`,

              source:
                "KITCHEN",

              sourceId:
                recipeItem.ingredient_id,

            });

          }

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
              item.dish_id,

            quantity:
              Number(
                item.quantity
              ),

            revenueAmount:
              Number(
                item.revenue || 0
              ),

          });

        if (
          !cogsResult.success
        ) {

          console.error(
            "COGS CREATION FAILED FULL:",
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
      {
        status: 500,
      }
    );

  }

}