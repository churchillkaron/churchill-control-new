import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import consumePreparedInventory from "@/lib/production/prepared/consumePreparedInventory";

export default async function processPreparedInventoryConsumption({
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
  order_item_id,
  dish_id,
  quantity = 1,
}) {

  try {
    const resolvedOrganizationId =
      organization_id || organizationId;

    const resolvedEntityId =
      entity_id || entityId || null;

    // ===== LOAD PREPARED COMPONENTS =====
    const {
      data: components,
      error: componentError,
    } = await supabaseAdmin
      .from(
        "recipe_prepared_items"
      )
      .select(`
        id,
        prepared_item_name,
        quantity_required,
        unit
      `)
      .eq(
        "dish_id",
        dish_id
      );

    if (componentError) {
      throw componentError;
    }

    // ===== CONSUME PREPARED INVENTORY =====
    for (const component of components || []) {

      const required =
        Number(
          component.quantity_required || 0
        ) * Number(quantity || 0);

      await consumePreparedInventory({

        organization_id:
          resolvedOrganizationId,
        entity_id:
          resolvedEntityId,

        prepared_item_name:
          component.prepared_item_name,

        quantity:
          required,

        reference_id:
          order_item_id,
      });
    }

    return {

      success: true,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
