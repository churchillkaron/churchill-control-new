export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import updateWorkCenterItemStatus from "@/lib/operations/work-centers/updateWorkCenterItemStatus";

const CLOSED_ORDER_STATUSES = ["PAID", "CLOSED", "COMPLETED", "CANCELLED", "VOID"];
const CLOSED_TICKET_STATUSES = ["COMPLETED", "SERVED", "CANCELLED", "VOID"];

function statusOf(value) {
  return String(value || "").trim().toUpperCase();
}

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function queryOrEmpty(query) {
  try {
    const result = await query;
    if (result.error) {
      return { data: [], error: result.error };
    }
    return { data: result.data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

function tableLabel(table) {
  return table?.table_number || table?.table_name || table?.name || null;
}

function orderTotal(order) {
  return numeric(order?.total_amount ?? order?.total ?? order?.grand_total);
}

function orderPaid(order) {
  return numeric(order?.amount_paid ?? order?.paid_amount);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const scope = searchParams.get("scope") || "all";

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      );
    }

    const resolvedOrganizationId = access.organizationId;
    const [tablesResult, ordersResult, ticketsResult, shiftsResult, paymentsResult] =
      await Promise.all([
        queryOrEmpty(
          supabaseAdmin
            .from("restaurant_tables")
            .select("*")
            .eq("organization_id", resolvedOrganizationId)
            .order("table_number", { ascending: true })
        ),
        queryOrEmpty(
          supabaseAdmin
            .from("orders")
            .select("*, order_items(*)")
            .eq("organization_id", resolvedOrganizationId)
            .order("created_at", { ascending: false })
            .limit(500)
        ),
        queryOrEmpty(
          supabaseAdmin
            .from("kitchen_tickets")
            .select("*")
            .eq("organization_id", resolvedOrganizationId)
            .order("created_at", { ascending: true })
            .limit(500)
        ),
        queryOrEmpty(
          supabaseAdmin
            .from("pos_shifts")
            .select("*")
            .eq("organization_id", resolvedOrganizationId)
            .order("created_at", { ascending: false })
            .limit(100)
        ),
        queryOrEmpty(
          supabaseAdmin
            .from("payments")
            .select("*")
            .eq("organization_id", resolvedOrganizationId)
            .order("created_at", { ascending: false })
            .limit(500)
        ),
      ]);

    const tables = tablesResult.data || [];
    const orders = (ordersResult.data || []).map((order) => {
      const total = orderTotal(order);
      const paid = orderPaid(order);
      return {
        ...order,
        total,
        paid_amount: paid,
        remaining_balance: Math.max(
          0,
          Number((numeric(order.remaining_balance) || total - paid).toFixed(2))
        ),
      };
    });
    const tickets = (ticketsResult.data || []).map((ticket) => ({
      ...ticket,
      items: Array.isArray(ticket.items) ? ticket.items : [],
    }));
    const shifts = shiftsResult.data || [];
    const payments = paymentsResult.data || [];

    const activeOrders = orders.filter(
      (order) => !CLOSED_ORDER_STATUSES.includes(statusOf(order.status))
    );
    const payableOrders = activeOrders.filter(
      (order) => order.remaining_balance > 0
    );
    const activeTickets = tickets.filter(
      (ticket) => !CLOSED_TICKET_STATUSES.includes(statusOf(ticket.status))
    );
    const readyTickets = activeTickets.filter((ticket) => {
      if (statusOf(ticket.status) === "READY") return true;
      const items = Array.isArray(ticket.items) ? ticket.items : [];
      return items.some((item) => statusOf(item.status) === "READY");
    });
    const activeShifts = shifts.filter((shift) =>
      ["OPEN", "ACTIVE"].includes(statusOf(shift.status))
    );

    const tableById = new Map(tables.map((table) => [table.id, table]));
    const orderById = new Map(orders.map((order) => [order.id, order]));

    const enrichedOrders = orders.map((order) => ({
      ...order,
      table:
        tableById.get(order.table_id) ||
        (order.table_number
          ? { table_number: order.table_number, table_name: order.table_number }
          : null),
      payment_status:
        order.payment_status ||
        (order.remaining_balance <= 0 && order.total > 0 ? "PAID" : "UNPAID"),
    }));

    const enrichedTickets = tickets.map((ticket) => ({
      ...ticket,
      order: orderById.get(ticket.order_id) || null,
      table_number:
        ticket.table_number ||
        orderById.get(ticket.order_id)?.table_number ||
        tableLabel(tableById.get(ticket.table_id)),
    }));

    const payload = {
      success: true,
      scope,
      actor: {
        id: access.user?.id || null,
        email: access.user?.email || null,
        staffAccountId: access.access?.staffAccountId || null,
        staffName:
          access.staff?.name ||
          access.staff?.display_name ||
          access.user?.email ||
          null,
      },
      tables,
      orders: enrichedOrders,
      activeOrders: enrichedOrders.filter(
        (order) => !CLOSED_ORDER_STATUSES.includes(statusOf(order.status))
      ),
      payableOrders: enrichedOrders.filter(
        (order) =>
          !CLOSED_ORDER_STATUSES.includes(statusOf(order.status)) &&
          order.remaining_balance > 0
      ),
      tickets: enrichedTickets,
      activeTickets: enrichedTickets.filter(
        (ticket) => !CLOSED_TICKET_STATUSES.includes(statusOf(ticket.status))
      ),
      readyTickets: enrichedTickets.filter((ticket) => {
        if (statusOf(ticket.status) === "READY") return true;
        return (ticket.items || []).some(
          (item) => statusOf(item.status) === "READY"
        );
      }),
      shifts,
      activeShifts,
      payments,
      metrics: {
        tables: tables.length,
        occupiedTables: tables.filter((table) =>
          ["OPEN", "ACTIVE", "OCCUPIED", "DINING", "READY", "BILL REQUESTED"].includes(
            statusOf(table.status)
          )
        ).length,
        activeOrders: activeOrders.length,
        payableOrders: payableOrders.length,
        activeTickets: activeTickets.length,
        readyTickets: readyTickets.length,
        activeShifts: activeShifts.length,
      },
      sourceHealth: {
        tables: !tablesResult.error,
        orders: !ordersResult.error,
        tickets: !ticketsResult.error,
        shifts: !shiftsResult.error,
        payments: !paymentsResult.error,
      },
      sourceErrors: Object.fromEntries(
        Object.entries({
          tables: tablesResult.error,
          orders: ordersResult.error,
          tickets: ticketsResult.error,
          shifts: shiftsResult.error,
          payments: paymentsResult.error,
        })
          .filter(([, error]) => error)
          .map(([key, error]) => [key, error.message || String(error)])
      ),
    };

    return Response.json(payload);
  } catch (error) {
    console.error("RESTAURANT OPERATIONS RUNTIME ERROR", error);
    return Response.json(
      {
        success: false,
        error: error?.message || "Unable to load restaurant operations",
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organizationId || body.organization_id;
    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      );
    }

    if (body.action === "UPDATE_KITCHEN_ITEM") {
      const result = await updateWorkCenterItemStatus({
        organizationId: access.organizationId,
        ticketId: body.ticketId || body.ticket_id || null,
        itemId: body.itemId || body.item_id,
        status: body.status,
      });

      return Response.json(result, { status: result.success ? 200 : 400 });
    }

    return Response.json(
      { success: false, error: "Unsupported restaurant operation" },
      { status: 400 }
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Restaurant operation failed",
      },
      { status: 500 }
    );
  }
}
