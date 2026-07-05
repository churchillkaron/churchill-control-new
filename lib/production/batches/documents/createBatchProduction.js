import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import processYieldCalculation from "@/lib/production/yield/processYieldCalculation";
import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";

export default async function createBatchProduction({
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
  batch_name,
  input_quantity = 0,
  output_quantity,
  output_unit,
  waste_reason = "PRODUCTION_LOSS",
  ingredients = [],
  created_by = "SYSTEM",
}) {
  try {
    const resolvedOrganizationId =
      organization_id || organizationId;

    const resolvedEntityId =
      entity_id || entityId || null;

    if (!resolvedOrganizationId) {
      throw new Error("organization_id required");
    }

    const rawQuantity =
      Number(input_quantity || output_quantity || 0);

    const usableQuantity =
      Number(output_quantity || 0);

    const wasteQuantity =
      Math.max(0, rawQuantity - usableQuantity);

    const { data: batch, error: batchError } =
      await supabaseAdmin
        .from("production_batches")
        .insert({
          organization_id: resolvedOrganizationId,
          entity_id: resolvedEntityId,
          batch_name,
          output_quantity: usableQuantity,
          output_unit,
          status: "COMPLETED",
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (batchError) {
      throw batchError;
    }

    const movements = [];

    for (const ingredient of ingredients || []) {
      if (!ingredient.ingredient_id) {
        continue;
      }

      const consumeQuantity =
        Number(ingredient.quantity || 0);

      if (consumeQuantity <= 0) {
        continue;
      }

      const { data: ingredientData, error: ingredientError } =
        await supabaseAdmin
          .from("ingredients")
          .select("*")
          .eq("id", ingredient.ingredient_id)
          .single();

      if (ingredientError) {
        throw ingredientError;
      }

      const unitCost =
        Number(
          ingredient.unit_cost ||
          ingredientData.cost_per_base_unit ||
          ingredientData.cost ||
          0
        );

      const movement =
        await createInventoryMovement({
          organizationId: resolvedOrganizationId,
          entityId: resolvedEntityId,
          ingredientId: ingredientData.id,
          movementType: "BATCH_PRODUCTION",
          quantity: consumeQuantity,
          unitCost,
          referenceType: "PRODUCTION_BATCH",
          referenceId: batch.id,
          sourceModule: "production",
          sourceDocument: "production_batches",
          sourceDocumentId: batch.id,
          notes: `Batch production ${batch_name}`,
          createdBy: created_by,
          postToFinance: Boolean(resolvedEntityId),
        });

      movements.push(movement);
    }

    await processYieldCalculation({
      organization_id: resolvedOrganizationId,
      entity_id: resolvedEntityId,
      batch_id: batch.id,
      raw_quantity: rawQuantity,
      usable_quantity: usableQuantity,
      waste_quantity: wasteQuantity,
      waste_reason,
    });

    const { error: preparedError } =
      await supabaseAdmin
        .from("prepared_inventory")
        .insert({
          organization_id: resolvedOrganizationId,
          entity_id: resolvedEntityId,
          batch_id: batch.id,
          item_name: batch_name,
          quantity: usableQuantity,
          unit: output_unit,
          created_at: new Date().toISOString(),
        });

    if (preparedError) {
      throw preparedError;
    }

    return {
      success: true,
      batch,
      movements,
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
