import { supabaseAdmin } from "../../shared/supabase/admin";
import { SYSTEM_EVENTS } from "../../shared/constants/events";
import { resolveWorkCenter } from "../../routing/resolveWorkCenter";

function groupItemsByWorkCenter(rows) {
  return rows.reduce((groups, row) => {
    const key = row.workCenterId || "UNROUTED";
    if (!groups[key]) groups[key] = [];
    groups[key].push(row.item);
    return groups;
  }, {});
}

export async function processWorkCenterEvents() {
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

    if (!events?.length) {
      return { success: true, processed: 0 };
    }

    let processed = 0;

    for (const event of events) {
      const {
        order_id,
        table_id,
        table_number,
        item_ids = [],
      } = event.payload || {};

      if (!order_id) {
        await supabaseAdmin
          .from("system_events")
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
          })
          .eq("id", event.id);

        continue;
      }

      const { data: orderExists } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("id", order_id)
        .maybeSingle();

      if (!orderExists) {
        console.warn("SKIPPING_ORPHAN_WORK_CENTER_EVENT", {
          eventId: event.id,
          orderId: order_id,
        });

        await supabaseAdmin
          .from("system_events")
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
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

      if (!items?.length) {
        await supabaseAdmin
          .from("system_events")
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
          })
          .eq("id", event.id);

        continue;
      }

      const routedItems = [];

      for (const item of items) {
        const workCenterId = await resolveWorkCenter({
          organizationId: event.payload?.organization_id,
          dishId: item?.dish_id,
        });

        routedItems.push({
          workCenterId,
          item,
        });
      }

      const groupedItems = groupItemsByWorkCenter(routedItems);

      for (const [workCenterId, groupItems] of Object.entries(groupedItems)) {
        if (!workCenterId || workCenterId === "UNROUTED") {
          console.warn("UNROUTED_WORK_CENTER_ITEMS", {
            eventId: event.id,
            orderId: order_id,
            itemIds: groupItems.map((item) => item.id),
          });
          continue;
        }

        const { data: existingTickets, error: existingError } =
          await supabaseAdmin
            .from("work_center_tickets")
            .select("*")
            .eq("order_id", order_id)
            .eq("work_center_id", workCenterId)
            .order("created_at", { ascending: true });

        if (existingError) throw existingError;

        let ticket =
          (existingTickets || []).find(
            t =>
              t.status !== "SERVED" &&
              t.status !== "COMPLETED"
          ) || null;

        if (!ticket) {
          const created = await supabaseAdmin
            .from("work_center_tickets")
            .insert({
              tenant_id: event.tenant_id,
              organization_id: event.payload?.organization_id || null,
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

        const ticketItems = groupItems.map((item) => ({
          tenant_id: event.tenant_id,
          work_center_ticket_id: ticket.id,
          work_center_id: workCenterId,
          item_name: item.item_name,
          quantity: item.quantity || 1,
          cooking_level: item.cooking_level || null,
          notes: item.notes || null,
          seat_position: item.seat_position || null,
          modifiers: item.modifiers || null,
          status: "NEW",
        }));

        const inserted = await supabaseAdmin
          .from("work_center_ticket_items")
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

      if (updated.error) throw updated.error;

      processed += 1;
    }

    return {
      success: true,
      processed,
    };
  } catch (err) {
    console.error("WORK_CENTER_WORKER_ERROR:", err);

    return {
      success: false,
      error: err.message,
    };
  }
}
