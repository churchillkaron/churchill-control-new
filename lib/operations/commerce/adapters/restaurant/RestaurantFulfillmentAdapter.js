import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import updateKitchenTicketItemStatus from "@/lib/restaurant/operations/updateKitchenTicketItemStatus";

const CLOSED_STATUSES = new Set(["COMPLETED", "SERVED", "CANCELLED", "VOID"]);

function statusOf(value) {
  return String(value || "").trim().toUpperCase();
}

function tableLabel(table) {
  return table?.table_number || table?.table_name || table?.name || null;
}

async function listQueue({ organizationId, scope = "active" }) {
  const [ticketsResult, ordersResult, tablesResult] = await Promise.all([
    supabaseAdmin
      .from("kitchen_tickets")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(500),
    supabaseAdmin
      .from("orders")
      .select("id, order_number, table_id, table_number, status")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("restaurant_tables")
      .select("id, table_number, table_name, name")
      .eq("organization_id", organizationId),
  ]);

  if (ticketsResult.error) throw ticketsResult.error;
  if (ordersResult.error) throw ordersResult.error;
  if (tablesResult.error) throw tablesResult.error;

  const orderById = new Map((ordersResult.data || []).map((order) => [order.id, order]));
  const tableById = new Map((tablesResult.data || []).map((table) => [table.id, table]));

  const queueEntries = (ticketsResult.data || []).map((ticket) => {
    const order = orderById.get(ticket.order_id) || null;
    const contextReference =
      ticket.table_number ||
      order?.table_number ||
      tableLabel(tableById.get(ticket.table_id || order?.table_id));
    const items = (Array.isArray(ticket.items) ? ticket.items : []).map((item) => ({
      id: item.id || item.order_item_id,
      source_id: item.id || item.order_item_id,
      name: item.item_name || item.name || "Item",
      quantity: Number(item.quantity || 1),
      status: statusOf(item.status || "NEW"),
      notes: item.notes || null,
      attributes: {
        cooking_level: item.cooking_level || null,
        seat_position: item.seat_position || null,
      },
      raw: item,
    }));

    return {
      id: ticket.id,
      queue_id: ticket.station || ticket.work_center_id || "restaurant-production",
      queue_name: ticket.station || ticket.work_center_name || "Production",
      work_center: {
        id: ticket.work_center_id || ticket.station || null,
        name: ticket.work_center_name || ticket.station || "Production",
      },
      status: statusOf(ticket.status || "NEW"),
      priority: ticket.priority || null,
      created_at: ticket.created_at,
      started_at: ticket.started_at || null,
      ready_at: ticket.ready_at || null,
      completed_at: ticket.completed_at || null,
      source: {
        type: "restaurant_kitchen_ticket",
        id: ticket.id,
      },
      demand: {
        type: "order",
        id: ticket.order_id || null,
        reference: ticket.order_number || order?.order_number || ticket.order_id || null,
      },
      context: {
        type: "service_location",
        id: ticket.table_id || order?.table_id || null,
        reference: contextReference || null,
        label: contextReference ? `Table ${contextReference}` : null,
      },
      work_items: items,
      raw: ticket,
    };
  });

  const normalizedScope = String(scope || "active").toLowerCase();
  const visibleEntries = queueEntries.filter((entry) => {
    if (normalizedScope === "all") return true;
    if (normalizedScope === "ready") {
      return (
        entry.status === "READY" ||
        entry.work_items.some((item) => item.status === "READY")
      );
    }
    return !CLOSED_STATUSES.has(entry.status);
  });

  return {
    application_id: "restaurant",
    queue_type: "fulfillment",
    entries: visibleEntries,
    metrics: {
      total: queueEntries.length,
      active: queueEntries.filter((entry) => !CLOSED_STATUSES.has(entry.status)).length,
      ready: queueEntries.filter(
        (entry) =>
          entry.status === "READY" ||
          entry.work_items.some((item) => item.status === "READY")
      ).length,
    },
  };
}

async function transitionWorkItem({ body, organizationId }) {
  const result = await updateKitchenTicketItemStatus({
    organizationId,
    ticketId:
      body.queueEntryId ||
      body.queue_entry_id ||
      body.ticketId ||
      body.ticket_id ||
      null,
    itemId:
      body.workItemId ||
      body.work_item_id ||
      body.itemId ||
      body.item_id,
    status: body.status || body.transition,
  });

  if (!result.success) {
    const error = new Error(result.error || "Fulfillment transition failed");
    error.status = 400;
    throw error;
  }

  return result;
}

const RestaurantFulfillmentAdapter = Object.freeze({
  id: "restaurant-fulfillment",
  listQueue,
  transitionWorkItem,
});

export default RestaurantFulfillmentAdapter;
