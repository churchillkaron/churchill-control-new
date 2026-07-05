import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createSupplierPrice({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  vendor_id,
  item_id,
  price,
  minimum_order_quantity = 1,
}) {
  try {

    const resolvedOrganizationId =
      organizationId || organization_id;

    const resolvedEntityId =
      entityId || entity_id || null;

    if (!resolvedOrganizationId) {
      throw new Error("organization_id required");
    }

    if (!vendor_id) {
      throw new Error("vendor_id required");
    }

    if (!item_id) {
      throw new Error("item_id required");
    }

    if (price === undefined || price === null) {
      throw new Error("price required");
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("supplier_prices")
      .insert({
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
        vendor_id,
        item_id,
        price: Number(price),
        minimum_order_quantity: Number(minimum_order_quantity || 1),
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      supplier_price: data,
    };

  } catch (error) {

    return {
      success: false,
      error: error.message,
    };

  }
}
