import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import processYieldCalculation from "@/lib/production/yield/processYieldCalculation";

export default async function createBatchProduction({
  tenant_id,
  batch_name,
  input_quantity = 0,
  output_quantity,
  output_unit,
  waste_reason = "PRODUCTION_LOSS",
  ingredients = [],
}) {

  try {

    const rawQuantity =
      Number(input_quantity || output_quantity || 0);

    const usableQuantity =
      Number(output_quantity || 0);

    const wasteQuantity =
      Math.max(
        0,
        rawQuantity - usableQuantity
      );

    const {
      data: batch,
      error: batchError,
    } = await supabaseAdmin
      .from("production_batches")
      .insert([
        {
          tenant_id,
          batch_name,
          output_quantity: usableQuantity,
          output_unit,
          status: "COMPLETED",
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (batchError) {
      throw batchError;
    }

    for (const ingredient of ingredients) {

      const {
        data: ingredientData,
        error: ingredientError,
      } = await supabaseAdmin
        .from("ingredients")
        .select("*")
        .eq("id", ingredient.ingredient_id)
        .single();

      if (ingredientError) {
        throw ingredientError;
      }

      const previousQuantity =
        Number(ingredientData.quantity || 0);

      const consumeQuantity =
        Number(ingredient.quantity || 0);

      const newQuantity =
        previousQuantity - consumeQuantity;

      const {
        error: updateError,
      } = await supabaseAdmin
        .from("ingredients")
        .update({
          quantity: newQuantity,
        })
        .eq("id", ingredient.ingredient_id);

      if (updateError) {
        throw updateError;
      }

      const {
        error: ledgerError,
      } = await supabaseAdmin
        .from("inventory_ledger")
        .insert([
          {
            tenant_id,
            ingredient_id: ingredientData.id,
            ingredient_name: ingredientData.name,
            movement_type: "BATCH_PRODUCTION",
            quantity: consumeQuantity,
            previous_quantity: previousQuantity,
            new_quantity: newQuantity,
            reference_type: "PRODUCTION_BATCH",
            reference_id: batch.id,
            created_at: new Date().toISOString(),
          },
        ]);

      if (ledgerError) {
        throw ledgerError;
      }
    }

    await processYieldCalculation({
      tenant_id,
      batch_id: batch.id,
      raw_quantity: rawQuantity,
      usable_quantity: usableQuantity,
      waste_quantity: wasteQuantity,
      waste_reason,
    });

    const {
      error: preparedError,
    } = await supabaseAdmin
      .from("prepared_inventory")
      .insert([
        {
          tenant_id,
          batch_id: batch.id,
          item_name: batch_name,
          quantity: usableQuantity,
          unit: output_unit,
          created_at: new Date().toISOString(),
        },
      ]);

    if (preparedError) {
      throw preparedError;
    }

    return {
      success: true,
      batch,
      yield: {
        raw_quantity: rawQuantity,
        usable_quantity: usableQuantity,
        waste_quantity: wasteQuantity,
      },
    };

  } catch (error) {

    return {
      success: false,
      error: error.message,
    };
  }
}
