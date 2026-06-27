import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function generateInventoryAlerts({
  tenant_id,
}) {

  try {

    const {
      data: ingredients,
      error: ingredientError,
    } = await supabaseAdmin
      .from("ingredients")
      .select("*")
      .eq("tenant_id", tenant_id);

    if (ingredientError) {
      throw ingredientError;
    }

    const {
      data: preparedInventory,
      error: preparedError,
    } = await supabaseAdmin
      .from("prepared_inventory")
      .select("*")
      .eq("tenant_id", tenant_id);

    if (preparedError) {
      throw preparedError;
    }

    const now =
      new Date();

    const alerts = [];

    for (const item of ingredients || []) {

      if (
        Number(
          item.quantity || 0
        ) <= 5
      ) {

        alerts.push({

          type:
            "LOW_RAW_STOCK",

          severity:
            "MEDIUM",

          item_name:
            item.name,

          quantity:
            item.quantity,

          unit:
            item.unit,

          message:
            "Raw ingredient stock is low.",
        });
      }
    }

    for (const item of preparedInventory || []) {

      if (
        Number(
          item.quantity || 0
        ) <= 0
      ) {

        alerts.push({

          type:
            "PREPARED_OUT_OF_STOCK",

          severity:
            "HIGH",

          item_name:
            item.item_name,

          quantity:
            item.quantity,

          unit:
            item.unit,

          message:
            "Prepared inventory is out of stock.",
        });
      }

      if (
        item.expiry_date
      ) {

        const expiry =
          new Date(
            item.expiry_date
          );

        const diffDays =
          (
            expiry - now
          ) /
          (
            1000 *
            60 *
            60 *
            24
          );

        if (
          diffDays <= 1 &&
          diffDays >= 0
        ) {

          alerts.push({

            type:
              "EXPIRY_URGENT",

            severity:
              "HIGH",

            item_name:
              item.item_name,

            quantity:
              item.quantity,

            unit:
              item.unit,

            message:
              "Prepared inventory expires within 24 hours.",
          });
        }

        if (
          diffDays < 0
        ) {

          alerts.push({

            type:
              "EXPIRED_STOCK",

            severity:
              "CRITICAL",

            item_name:
              item.item_name,

            quantity:
              item.quantity,

            unit:
              item.unit,

            message:
              "Prepared inventory has expired.",
          });
        }
      }
    }

    return {

      success: true,

      alerts,

      count:
        alerts.length,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
