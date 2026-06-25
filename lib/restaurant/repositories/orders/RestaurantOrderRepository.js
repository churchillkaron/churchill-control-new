import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function loadRestaurantOrder({
  organizationId,
  orderId,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!orderId) {
    throw new Error("orderId required");
  }

  const { data, error } =
    await supabaseAdmin
      .from("orders")
      .select(`
        *,
        order_items (*)
      `)
      .eq("organization_id", organizationId)
      .eq("id", orderId)
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function saveRestaurantOrder({
  aggregate,
}) {
  const state =
    aggregate.state;

  if (!state.organizationId && !state.organization_id) {
    throw new Error("organizationId required");
  }

  const organizationId =
    state.organizationId ||
    state.organization_id;

  const now =
    new Date().toISOString();

  let orderRecord = null;

  if (state.id) {
    const { data, error } =
      await supabaseAdmin
        .from("orders")
        .update({
          session_id: state.sessionId || state.session_id || null,
          table_id: state.tableId || state.table_id || null,
          table_number: state.tableNumber || state.table_number || null,
          customer_id: state.customerId || state.customer_id || null,
          customer_name: state.customerName || state.customer_name || null,
          staff_id: state.staffId || state.staff_id || null,
          staff_name: state.staffName || state.staff_name || null,
          status: state.status || "OPEN",
          payment_status: state.paymentStatus || state.payment_status || "UNPAID",
          production_status: state.productionStatus || state.production_status || "PENDING",
          subtotal: Number(state.subtotal || 0),
          service_charge_amount: Number(state.serviceCharge || state.service_charge_amount || 0),
          vat_amount: Number(state.vat || state.vat_amount || 0),
          discount_amount: Number(state.discount || state.discount_amount || 0),
          total: Number(state.total || state.total_amount || 0),
          total_amount: Number(state.total || state.total_amount || 0),
          updated_at: now,
        })
        .eq("organization_id", organizationId)
        .eq("id", state.id)
        .select()
        .single();

    if (error) {
      throw error;
    }

    orderRecord = data;
  } else {
    const { data, error } =
      await supabaseAdmin
        .from("orders")
        .insert({
          organization_id: organizationId,
          session_id: state.sessionId || null,
          table_id: state.tableId || null,
          table_number: state.tableNumber || null,
          customer_id: state.customerId || null,
          customer_name: state.customerName || null,
          staff_id: state.staffId || null,
          staff_name: state.staffName || null,
          status: state.status || "OPEN",
          payment_status: state.paymentStatus || "UNPAID",
          production_status: state.productionStatus || "PENDING",
          subtotal: Number(state.subtotal || 0),
          service_charge_amount: Number(state.serviceCharge || 0),
          vat_amount: Number(state.vat || 0),
          discount_amount: Number(state.discount || 0),
          total: Number(state.total || 0),
          total_amount: Number(state.total || 0),
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

    if (error) {
      throw error;
    }

    orderRecord = data;
  }

  const items =
    Array.isArray(state.items)
      ? state.items
      : [];

  for (const item of items) {
    if (item.persisted || item.id_from_db) {
      continue;
    }

    const { error } =
      await supabaseAdmin
        .from("order_items")
        .insert({
          organization_id: organizationId,
          order_id: orderRecord.id,
          dish_id: item.dishId || item.dish_id || null,
          item_name: item.name || item.item_name,
          quantity: Number(item.quantity || 1),
          price: Number(item.price || 0),
          notes: item.notes || null,
          modifiers: item.modifiers || {},
          seat_position: item.seatPosition || item.seat_position || null,
          status: item.status || "PENDING",
          created_at: now,
          updated_at: now,
        });

    if (error) {
      throw error;
    }
  }

  return loadRestaurantOrder({
    organizationId,
    orderId: orderRecord.id,
  });
}
