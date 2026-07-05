import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createPurchaseOrder({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  vendor_id,
  purchase_request_id = null,
  items = [],
  ordered_by = "SYSTEM",
  approved_by = null,
  currency = "THB",
  expected_delivery_date = null,
  notes = null,
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

    if (!Array.isArray(items) || !items.length) {
      throw new Error("items required");
    }

    const subtotal =
      items.reduce(
        (sum, item) =>
          sum +
          Number(item.qty || item.quantity || 0) *
          Number(item.unit_price || item.price || 0),
        0
      );

    const tax_amount = 0;
    const total_amount = subtotal + tax_amount;

    const {
      data: purchaseOrder,
      error: poError,
    } = await supabaseAdmin
      .from("purchase_orders")
      .insert({
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
        purchase_request_id,
        vendor_id,
        status: "PENDING_APPROVAL",
        ordered_by,
        approved_by,
        subtotal,
        tax_amount,
        total_amount,
        currency,
        expected_delivery_date,
        notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (poError) throw poError;

    const rows =
      items.map(item => ({
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
        purchase_order_id: purchaseOrder.id,
        item_id:
          item.item_id || null,
        item_name:
          item.item_name ||
          item.item_name ||
          item.name,
        qty:
          Number(item.qty || item.quantity || 0),
        unit_price:
          Number(item.unit_price || item.price || 0),
        total_price:
          Number(item.qty || item.quantity || 0) *
          Number(item.unit_price || item.price || 0),
        received_qty: 0,
        created_at: new Date().toISOString(),
      }));

    const {
      error: itemError,
    } = await supabaseAdmin
      .from("purchase_order_items")
      .insert(rows);

    if (itemError) throw itemError;

    return {
      success: true,
      purchase_order: purchaseOrder,
      items: rows,
    };

  } catch (error) {

    return {
      success: false,
      error: error.message,
    };

  }
}
