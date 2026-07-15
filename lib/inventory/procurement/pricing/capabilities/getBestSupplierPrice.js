import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export default async function getBestSupplierPrice({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  item_id,
}) {

  try {

    const resolvedOrganizationId =
      organizationId || organization_id;

    const resolvedEntityId =
      entityId || entity_id || null;

    if (!resolvedOrganizationId) {
      throw new Error("organization_id required");
    }

    if (!resolvedEntityId) {
      throw new Error("entity_id required");
    }

    const {
      data,
      error,
    } = await supabaseAdmin

      .from("supplier_prices")

      .select(`
        *,
        parties (
          id,
          display_name,
          legal_name,
          risk_level,
          is_active,
          is_blocked
        )
      `)

      .eq(
        "organization_id",
        resolvedOrganizationId
      )

      .eq(
        "entity_id",
        resolvedEntityId
      )

      .eq(
        "item_id",
        item_id
      )

      .order(
        "price",
        {
          ascending: true,
        }
      )

      .limit(1)

      .single();

    if (error) {

      throw error;

    }

    return {

      success: true,

      best_supplier:
        data,

    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,

    };

  }

}
