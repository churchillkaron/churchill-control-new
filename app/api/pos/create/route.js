export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { openTableSession } from "@/lib/restaurant/services/openTableSession";
import { recordSystemEvent } from "@/lib/events/recordSystemEvent";
import { SYSTEM_EVENTS } from "@/lib/shared/constants/events";
import { processWorkCenterEvents } from "@/lib/workers/work-centers/processWorkCenterEvents";

export async function POST(req) {
  try {
    const body = await req.json();

    const organizationId =
      body.organization_id ||
      body.organizationId ||
      null;

    const tableId =
      body.table_id ||
      body.tableId ||
      null;

    const tableNumber =
      body.table ||
      body.table_number ||
      body.tableNumber ||
      null;

    const items =
      Array.isArray(body.items)
        ? body.items
        : [];

    if (!organizationId) {
      return Response.json(
        { success: false, error: "Missing organization_id" },
        { status: 400 }
      );
    }

    if (!tableId && !tableNumber) {
      return Response.json(
        { success: false, error: "Missing table" },
        { status: 400 }
      );
    }

    if (!items.length) {
      return Response.json(
        { success: false, error: "No items" },
        { status: 400 }
      );
    }

    if (items.some((item) => !item.seatPosition && !item.seat_position)) {
      return Response.json(
        { success: false, error: "Every item must have a seat" },
        { status: 400 }
      );
    }

    const session = await openTableSession({
      organizationId,
      tableId,
      tableNumber,
      customerId: body.customerId || body.customer_id || null,
      customerName: body.customerName || body.customer_name || null,
      customerEmail: body.customerEmail || body.customer_email || null,
      customerPhone: body.customerPhone || body.customer_phone || null,
      guestCount: Number(body.guestCount || body.guest_count || 0),
    });

    if (!session?.id) {
      return Response.json(
        { success: false, error: "Failed to open table session" },
        { status: 500 }
      );
    }

    const now = new Date().toISOString();

    const existing = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("table_id", session.table_id || tableId)
      .eq("status", "OPEN")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    let order = existing.data || null;
    let isNewOrder = false;

    if (!order) {
      isNewOrder = true;

      const created = await supabaseAdmin
        .from("orders")
        .insert({
          organization_id: organizationId,
          session_id: session.id,
          table_id: session.table_id || tableId,
          table_number: session.table_number || tableNumber,
          customer_id: body.customerId || body.customer_id || null,
          customer_name: body.customerName || body.customer_name || null,
          staff_id: body.staff_id || body.staffId || null,
          staff_name: body.staff_name || body.staffName || "Staff",
          status: "OPEN",
          payment_status: "UNPAID",
          production_status: "PENDING",
          subtotal: 0,
          service_charge_amount: 0,
          vat_amount: 0,
          discount_amount: 0,
          total: 0,
          total_amount: 0,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (created.error) {
        throw created.error;
      }

      order = created.data;
    }

    const orderItems = [];

    for (const item of items) {
      const quantity = Number(item.quantity || 1);
      const seatPosition =
        item.seatPosition ||
        item.seat_position ||
        item.modifiers?.seat ||
        null;

      for (let i = 0; i < quantity; i++) {
        orderItems.push({
          organization_id: organizationId,
          order_id: order.id,
          dish_id: item.dish_id || item.dishId || item.id || null,
          item_name:
            item.item_name ||
            item.name ||
            item.dish_name ||
            item.title ||
            "Unnamed Item",
          quantity: 1,
          price: Number(item.price || 0),
          station: item.station || null,
          status: "PENDING",
          staff_id: body.staff_id || body.staffId || null,
          notes: item.notes || null,
          cooking_level: item.cookingLevel || item.cooking_level || null,
          seat_position: seatPosition,
          modifiers: item.modifiers || null,
          created_at: now,
          updated_at: now,
        });
      }
    }

    const inserted = await supabaseAdmin
      .from("order_items")
      .insert(orderItems)
      .select("id");

    if (inserted.error) {
      throw inserted.error;
    }

    const allItems = await supabaseAdmin
      .from("order_items")
      .select("price, quantity")
      .eq("organization_id", organizationId)
      .eq("order_id", order.id);

    if (allItems.error) {
      throw allItems.error;
    }

    const subtotal = (allItems.data || []).reduce(
      (sum, item) =>
        sum + Number(item.price || 0) * Number(item.quantity || 1),
      0
    );

    const serviceCharge = Number((subtotal * 0.05).toFixed(2));
    const vat = Number(((subtotal + serviceCharge) * 0.07).toFixed(2));
    const total = Number((subtotal + serviceCharge + vat).toFixed(2));

    await supabaseAdmin
      .from("orders")
      .update({
        subtotal,
        service_charge_amount: serviceCharge,
        vat_amount: vat,
        total,
        total_amount: total,
        updated_at: now,
      })
      .eq("organization_id", organizationId)
      .eq("id", order.id);

    await recordSystemEvent({
      organizationId,
      type: isNewOrder
        ? SYSTEM_EVENTS.ORDER_CREATED
        : SYSTEM_EVENTS.ORDER_ITEM_ADDED,
      payload: {
        order_id: order.id,
        organization_id: organizationId,
        table_id: session.table_id || tableId,
        table_number: session.table_number || tableNumber,
        session_id: session.id,
        item_ids: (inserted.data || []).map((item) => item.id),
        items_count: orderItems.length,
      },
    });

    await processWorkCenterEvents();

    return Response.json({
      success: true,
      order_id: order.id,
      session_id: session.id,
      inserted_items: inserted.data || [],
    });
  } catch (error) {
    console.error("POS CREATE ERROR", error);

    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
