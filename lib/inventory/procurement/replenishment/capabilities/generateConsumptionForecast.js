import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function generateConsumptionForecast({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  ingredient_name,
  item_name,
  days = 30,
}) {

  try {
    const resolvedOrganizationId =
      organizationId || organization_id;

    const resolvedEntityId =
      entityId || entity_id || null;

    const resolvedItemName =
      ingredient_name || item_name;

    if (!resolvedOrganizationId) {
      throw new Error("organization_id required");
    }

    if (!resolvedEntityId) {
      throw new Error("entity_id required");
    }

    if (!resolvedItemName) {
      throw new Error("item_name required");
    }

    const since =
      new Date();

    since.setDate(
      since.getDate() -
      Number(days || 30)
    );

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        "inventory_ledger"
      )
      .select("*")
      .eq(
        "organization_id",
        resolvedOrganizationId
      )
      .eq(
        "entity_id",
        resolvedEntityId
      )
      .eq(
        "ingredient_name",
        resolvedItemName
      )
      .in(
        "movement_type",
        [
          "CONSUMPTION",
          "PREPARED_CONSUMPTION",
        ]
      )
      .gte(
        "created_at",
        since.toISOString()
      );

    if (error) {
      throw error;
    }

    const totalConsumption =
      (data || []).reduce(
        (
          sum,
          row
        ) =>
          sum +
          Number(
            row.quantity || 0
          ),
        0
      );

    const avgDailyConsumption =
      totalConsumption /
      Number(days || 1);

    return {

      success: true,

      ingredient_name:
        resolvedItemName,

      item_name:
        resolvedItemName,

      days,

      total_consumption:
        Number(
          totalConsumption.toFixed(2)
        ),

      avg_daily_consumption:
        Number(
          avgDailyConsumption.toFixed(2)
        ),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
