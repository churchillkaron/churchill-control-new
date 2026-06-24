import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createPurchaseOrder({
  tenant_id,
  organization_id,
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
    if (!tenant_id) {
      throw new Error("tenant_id required");
    }

    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!vendor_id) {
      throw new Error("vendor_id required");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("items required");
    }

    let subtotal = 0;

    for (const item of items) {
      subtotal +=
        Number(item.qty || item.quantity || 0) *
        Number(item.unit_price || item.price || 0);
    }

    const taxAmount = 0;
    const totalAmount = subtotal + taxAmount;

    const {
      data: po,
      error: poError,
    } = await supabaseAdmin
      .from("purchase_orders")
      .insert([
        {
          tenant_id,
          organization_id,
          purchase_request_id,
          vendor_id,
          status: "PENDING_APPROVAL",
          ordered_by,
          approved_by,
          subtotal: Number(subtotal.toFixed(2)),
          tax_amount: Number(taxAmount.toFixed(2)),
          total_amount: Number(totalAmount.toFixed(2)),
          currency,
          expected_delivery_date,
          notes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (poError) {
      throw poError;
    }

    const poItems = items.map((item) => {
      const qty = Number(item.qty || item.quantity || 0);
      const unitPrice = Number(item.unit_price || item.price || 0);

      return {
        tenant_id,
        organization_id,
        purchase_order_id: po.id,
        item_name:
          item.item_name ||
          item.ingredient_name ||
          item.name ||
          "Item",
        qty,
        unit_price: unitPrice,
        total_price: Number((qty * unitPrice).toFixed(2)),
        received_qty: 0,
        created_at: new Date().toISOString(),
      };
    });

    const {
      error: itemError,
    } = await supabaseAdmin
      .from("purchase_order_items")
      .insert(poItems);

    if (itemError) {
      throw itemError;
    }

    return {
      success: true,
      purchase_order: po,
      items: poItems,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
