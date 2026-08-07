import { supabaseAdmin } from "../../shared/supabase/admin";
import { SYSTEM_EVENTS } from "../../shared/constants/events";
import { resolveWorkCenter } from "../../routing/resolveWorkCenter";
import { createKitchenTicketDocument } from "../../restaurant/kitchen/documents/KitchenTicketFactory";
import { createKitchenTicket } from "../../restaurant/repositories/kitchen/KitchenTicketRepository";
import { createBarTicketDocument } from "../../restaurant/bar/documents/BarTicketFactory";
import { createBarTicket } from "../../restaurant/repositories/bar/BarTicketRepository";

const WORK_CENTER_EVENT_TYPES = [
  SYSTEM_EVENTS.ORDER_CREATED,
  SYSTEM_EVENTS.ORDER_ITEM_ADDED,
];

const CLOSED_TICKET_STATUSES = new Set([
  "COMPLETED",
  "SERVED",
  "CANCELLED",
  "VOID",
]);

function groupItemsByWorkCenter(rows) {
  return rows.reduce((groups, row) => {
    const key = row.workCenterId || "UNROUTED";
    if (!groups[key]) groups[key] = [];
    groups[key].push(row.item);
    return groups;
  }, {});
}

function toFulfillmentItem(item) {
  return {
    id: item.id,
    order_item_id: item.id,
    dish_id: item.dish_id || null,
    item_name: item.item_name || "Unnamed Item",
    quantity: Number(item.quantity || 1),
    cooking_level: item.cooking_level || null,
    notes: item.notes || null,
    seat_position: item.seat_position || null,
    modifiers:
      item.modifiers || item.transaction_configuration_selections || null,
    status: "NEW",
    created_at: item.created_at || new Date().toISOString(),
  };
}

function getFulfillmentItemId(item) {
  return item?.order_item_id || item?.id || null;
}

async function loadPendingWorkCenterEvents() {
  const { data, error } = await supabaseAdmin
    .from("system_events")
    .select("*")
    .in("type", WORK_CENTER_EVENT_TYPES)
    .eq("processed", false)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function markEventProcessed(eventId) {
  const updated = await supabaseAdmin
    .from("system_events")
    .update({
      processed: true,
      processing: false,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (updated.error) throw updated.error;
}

async function loadWorkCenter({ organizationId, workCenterId }) {
  const { data, error } = await supabaseAdmin
    .from("work_centers")
    .select("id,name,code,active")
    .eq("organization_id", organizationId)
    .eq("id", workCenterId)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error(`Active work center not found: ${workCenterId}`);
  }

  return data;
}

function resolveTicketTarget(workCenter) {
  const code = String(workCenter?.code || "").trim().toUpperCase();

  if (code === "BAR") {
    return {
      table: "bar_tickets",
      createDocument: createBarTicketDocument,
      createTicket: createBarTicket,
    };
  }

  return {
    table: "kitchen_tickets",
    createDocument: createKitchenTicketDocument,
    createTicket: createKitchenTicket,
  };
}

async function appendCanonicalTicket({
  organizationId,
  orderId,
  sessionId,
  tableId,
  tableNumber,
  workCenter,
  items,
}) {
  const target = resolveTicketTarget(workCenter);
  const existingResult = await supabaseAdmin
    .from(target.table)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("order_id", orderId)
    .eq("work_center_id", workCenter.id)
    .order("created_at", { ascending: true });

  if (existingResult.error) throw existingResult.error;

  const existingTicket = (existingResult.data || []).find(
    (ticket) => !CLOSED_TICKET_STATUSES.has(ticket.status)
  );

  const incomingItems = items.map(toFulfillmentItem);

  if (!existingTicket) {
    const ticket = target.createDocument({
      organizationId,
      orderId,
      sessionId,
      tableId,
      tableNumber,
      workCenterId: workCenter.id,
      station: workCenter.name || workCenter.code || null,
      items: incomingItems,
    });

    ticket.station = workCenter.name || workCenter.code || null;

    await target.createTicket({
      document: ticket,
    });

    return {
      ticketId: ticket.id,
      ticketStore: target.table,
      insertedItems: incomingItems.length,
    };
  }

  const currentItems = Array.isArray(existingTicket.items)
    ? existingTicket.items
    : [];
  const currentItemIds = new Set(
    currentItems.map(getFulfillmentItemId).filter(Boolean)
  );
  const newItems = incomingItems.filter(
    (item) => !currentItemIds.has(getFulfillmentItemId(item))
  );

  if (!newItems.length) {
    return {
      ticketId: existingTicket.id,
      ticketStore: target.table,
      insertedItems: 0,
    };
  }

  const updated = await supabaseAdmin
    .from(target.table)
    .update({
      items: [...currentItems, ...newItems],
      status:
        existingTicket.status === "READY"
          ? "PREPARING"
          : existingTicket.status || "NEW",
      ready_at: existingTicket.status === "READY" ? null : existingTicket.ready_at,
      station: existingTicket.station || workCenter.name || workCenter.code || null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", existingTicket.id)
    .select("id")
    .single();

  if (updated.error) throw updated.error;

  return {
    ticketId: existingTicket.id,
    ticketStore: target.table,
    insertedItems: newItems.length,
  };
}

export async function processWorkCenterEvents(events = null) {
  try {
    const ownsEventLifecycle = !Array.isArray(events);
    const pendingEvents = Array.isArray(events)
      ? events.filter((event) => WORK_CENTER_EVENT_TYPES.includes(event?.type))
      : await loadPendingWorkCenterEvents();

    if (!pendingEvents.length) {
      return { success: true, processed: 0 };
    }

    let processed = 0;
    let ticketsChanged = 0;
    let itemsInserted = 0;

    for (const event of pendingEvents) {
      const {
        order_id: orderId,
        session_id: sessionId,
        table_id: tableId,
        table_number: tableNumber,
        item_ids: itemIds = [],
      } = event.payload || {};
      const organizationId =
        event.organization_id || event.payload?.organization_id || null;

      if (!organizationId) {
        throw new Error(`Work center event ${event.id} has no organizationId`);
      }

      if (!orderId) {
        if (ownsEventLifecycle) await markEventProcessed(event.id);
        continue;
      }

      const orderResult = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("id", orderId)
        .maybeSingle();

      if (orderResult.error) throw orderResult.error;

      if (!orderResult.data) {
        console.warn("SKIPPING_ORPHAN_WORK_CENTER_EVENT", {
          eventId: event.id,
          orderId,
          organizationId,
        });

        if (ownsEventLifecycle) await markEventProcessed(event.id);
        continue;
      }

      let itemQuery = supabaseAdmin
        .from("order_items")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("order_id", orderId);

      if (Array.isArray(itemIds) && itemIds.length) {
        itemQuery = itemQuery.in("id", itemIds);
      }

      const { data: items, error: itemsError } = await itemQuery;

      if (itemsError) throw itemsError;

      if (!items?.length) {
        if (ownsEventLifecycle) await markEventProcessed(event.id);
        continue;
      }

      const routedItems = [];

      for (const item of items) {
        const workCenterId = await resolveWorkCenter({
          organizationId,
          dishId: item?.dish_id,
        });

        routedItems.push({
          workCenterId,
          item,
        });
      }

      const groupedItems = groupItemsByWorkCenter(routedItems);
      const unroutedItems = groupedItems.UNROUTED || [];

      if (unroutedItems.length) {
        throw new Error(
          `No active work center route for order items: ${unroutedItems
            .map((item) => item.id)
            .join(", ")}`
        );
      }

      for (const [workCenterId, groupItems] of Object.entries(groupedItems)) {
        const workCenter = await loadWorkCenter({
          organizationId,
          workCenterId,
        });

        const result = await appendCanonicalTicket({
          organizationId,
          orderId,
          sessionId,
          tableId,
          tableNumber,
          workCenter,
          items: groupItems,
        });

        ticketsChanged += result.insertedItems > 0 ? 1 : 0;
        itemsInserted += result.insertedItems;
      }

      if (ownsEventLifecycle) {
        await markEventProcessed(event.id);
      }

      processed += 1;
    }

    return {
      success: true,
      processed,
      ticketsChanged,
      itemsInserted,
    };
  } catch (error) {
    console.error("WORK_CENTER_WORKER_ERROR:", error);

    return {
      success: false,
      error: error.message,
    };
  }
}
