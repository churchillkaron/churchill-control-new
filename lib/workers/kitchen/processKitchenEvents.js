import { supabaseAdmin } from "../../shared/supabase/admin";
import { SYSTEM_EVENTS } from "../../shared/constants/events";
import { resolveWorkCenter } from "../../routing/resolveWorkCenter";

export async function processKitchenEvents() {
  try {
    const { data: events, error } = await supabaseAdmin
      .from("system_events")
      .select("*")
      .in("type", [
        SYSTEM_EVENTS.ORDER_CREATED,
        SYSTEM_EVENTS.ORDER_ITEM_ADDED,
      ])
      .eq("processed", false)
      .order("created_at", { ascending: true });

    if (error) throw error;

    console.log(
      "WORKER EVENTS",
      events.map(e => ({
        id: e.id,
        processed: e.processed,
        type: e.type
      }))
    );

    if (!events?.length) return { success: true, processed: 0 };

    for (const event of events) {

      console.log(
        "KITCHEN EVENT",
        event.id,
        event.type,
        event.payload
      );
      const {
        order_id,
        table_id,
        table_number,
        item_ids = [],
      } = event.payload || {};

      if (!order_id) continue;

      const { data: orderExists } =
        await supabaseAdmin
          .from("orders")
          .select("id")
          .eq("id", order_id)
          .maybeSingle();

      if (!orderExists) {

        console.warn(
          "SKIPPING ORPHAN EVENT",
          order_id
        );

        await supabaseAdmin
          .from("system_events")
          .update({
            processed: true
          })
          .eq("id", event.id);

        continue;
      }

      let itemQuery = supabaseAdmin
        .from("order_items")
        .select("*")
        .eq("order_id", order_id);

      if (Array.isArray(item_ids) && item_ids.length) {
        itemQuery = itemQuery.in("id", item_ids);
      }

      const { data: items, error: itemsError } = await itemQuery;

      if (itemsError) throw itemsError;

      const firstItem =
        Array.isArray(items) && items.length > 0
          ? items[0]
          : null;

      const workCenterId =
        await resolveWorkCenter({
          organizationId:
            event.payload?.organization_id,
          dishId:
            firstItem?.dish_id,
        });

      const { data: existingTickets } =
        await supabaseAdmin
          .from("kitchen_tickets")
          .select("*")
          .eq("order_id", order_id)
          .eq("work_center_id", workCenterId)
          .order("created_at", {
            ascending: true,
          });

      let ticket =
        existingTickets?.[0] || null;

      if (!ticket) {
        const created = await supabaseAdmin
          .from("kitchen_tickets")
          .insert({
            tenant_id: event.tenant_id,
            order_id,
            table_id: table_id || null,
            table_number: table_number || null,
            work_center_id: workCenterId,
            status: "NEW",
          })
          .select()
          .single();

        if (created.error) throw created.error;
        ticket = created.data;
      }

      if (items?.length) {
        const ticketItems = items.map((item) => ({
          tenant_id: event.tenant_id,
          kitchen_ticket_id: ticket.id,
          work_center_id: workCenterId,
          item_name: item.item_name,
          quantity: item.quantity || 1,
          status: "NEW",
        }));

        const inserted = await supabaseAdmin
          .from("kitchen_ticket_items")
          .insert(ticketItems);

        if (inserted.error) throw inserted.error;
      }


      const updated = await supabaseAdmin
        .from("system_events")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
        })
        .eq("id", event.id);

      console.log(
        "PROCESSED RESULT",
        event.id,
        updated.error || "OK"
      );
    }

    return {
      success: true,
      processed: events.length,
    };
  } catch (err) {
    console.error("KITCHEN WORKER ERROR:", err);

    return {
      success: false,
      error: err.message,
    };
  }
}