export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { loadAccountingFirmDashboard } from "@/lib/accounting/loadAccountingFirmDashboard";
import { loadAccountingClients } from "@/lib/accounting/loadAccountingClients";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const CLOSED_ORDER_STATUSES = new Set([
  "PAID",
  "CLOSED",
  "CANCELLED",
  "VOID",
]);

const CLOSED_KITCHEN_STATUSES = new Set([
  "COMPLETED",
  "SERVED",
  "CANCELLED",
  "VOID",
]);

function statusOf(record) {
  return String(record?.status || "").trim().toUpperCase();
}

function numberFrom(record, fields) {
  for (const field of fields) {
    const value = Number(record?.[field]);
    if (Number.isFinite(value)) return value;
  }

  return 0;
}

function sumRows(rows, fields) {
  return (rows || []).reduce(
    (sum, row) => sum + numberFrom(row, fields),
    0
  );
}

async function safeQuery(query) {
  try {
    const result = await query;

    return {
      data: result.data || [],
      error: result.error || null,
    };
  } catch (error) {
    return {
      data: [],
      error,
    };
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const organizationType = searchParams.get("organizationType");

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    if (organizationType === "accounting_firm") {
      const [metrics, clients] = await Promise.all([
        loadAccountingFirmDashboard({ organizationId }),
        loadAccountingClients({ organizationId }),
      ]);

      return NextResponse.json({
        success: true,
        metrics,
        clients,
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const [
      payments,
      orders,
      tables,
      kitchenTickets,
      shifts,
      inventoryItems,
      payables,
      waste,
      workCenters,
    ] = await Promise.all([
      safeQuery(
        supabaseAdmin
          .from("payments")
          .select("*")
          .eq("organization_id", organizationId)
          .gte("created_at", todayIso)
      ),
      safeQuery(
        supabaseAdmin
          .from("orders")
          .select("*")
          .eq("organization_id", organizationId)
          .gte("created_at", todayIso)
      ),
      safeQuery(
        supabaseAdmin
          .from("restaurant_tables")
          .select("*")
          .eq("organization_id", organizationId)
      ),
      safeQuery(
        supabaseAdmin
          .from("kitchen_tickets")
          .select("*")
          .eq("organization_id", organizationId)
      ),
      safeQuery(
        supabaseAdmin
          .from("pos_shifts")
          .select("*")
          .eq("organization_id", organizationId)
      ),
      safeQuery(
        supabaseAdmin
          .from("inventory_items")
          .select("*")
          .eq("organization_id", organizationId)
      ),
      safeQuery(
        supabaseAdmin
          .from("accounts_payable")
          .select("*")
          .eq("organization_id", organizationId)
      ),
      safeQuery(
        supabaseAdmin
          .from("production_waste_logs")
          .select("*")
          .eq("organization_id", organizationId)
          .gte("created_at", todayIso)
      ),
      safeQuery(
        supabaseAdmin
          .from("organization_work_centers")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("active", true)
          .order("display_order", { ascending: true })
      ),
    ]);

    const paidPayments = (payments.data || []).filter(
      (payment) => statusOf(payment) === "PAID"
    );
    const paidOrders = (orders.data || []).filter((order) => {
      const orderStatus = statusOf(order);
      const paymentStatus = String(order?.payment_status || "")
        .trim()
        .toUpperCase();

      return paymentStatus === "PAID" || orderStatus === "PAID";
    });
    const openOrders = (orders.data || []).filter(
      (order) => !CLOSED_ORDER_STATUSES.has(statusOf(order))
    );
    const occupiedTables = (tables.data || []).filter((table) =>
      ["OCCUPIED", "ACTIVE", "OPEN"].includes(statusOf(table))
    );
    const operationsQueue = (kitchenTickets.data || []).filter(
      (ticket) => !CLOSED_KITCHEN_STATUSES.has(statusOf(ticket))
    );
    const readyOrders = operationsQueue.filter(
      (ticket) => statusOf(ticket) === "READY"
    );
    const activeStaff = (shifts.data || []).filter((shift) =>
      ["OPEN", "ACTIVE"].includes(statusOf(shift))
    );
    const lowStock = (inventoryItems.data || []).filter((item) => {
      const available = numberFrom(item, [
        "quantity_on_hand",
        "on_hand_quantity",
        "current_quantity",
        "stock",
      ]);
      const minimum = numberFrom(item, [
        "reorder_point",
        "minimum_stock",
        "min_stock",
      ]);

      return minimum > 0 && available <= minimum;
    });
    const pendingPayables = (payables.data || []).filter(
      (payable) => statusOf(payable) !== "PAID"
    );

    const paidOrderRevenue = sumRows(paidOrders, ["total_amount", "total"]);
    const paymentRevenue = sumRows(paidPayments, ["amount", "total_amount"]);
    const revenue = paymentRevenue || paidOrderRevenue;
    const serviceCharge = sumRows(orders.data, ["service_charge_amount"]);
    const pendingPayablesAmount = sumRows(pendingPayables, [
      "amount",
      "balance_due",
      "total_amount",
    ]);
    const wasteCost = sumRows(waste.data, ["estimated_cost", "cost"]);
    const averageOrder = paidOrders.length > 0 ? revenue / paidOrders.length : 0;

    const metrics = {
      revenue,
      serviceCharge,
      totalOrders: orders.data.length,
      openOrders: openOrders.length,
      paidOrders: paidOrders.length,
      averageOrder,
      occupiedTables: occupiedTables.length,
      totalTables: tables.data.length,
      operationsQueue: operationsQueue.length,
      readyOrders: readyOrders.length,
      activeStaff: activeStaff.length,
      lowStockAlerts: lowStock.length,
      pendingPayables: pendingPayables.length,
      pendingPayablesAmount,
      wasteCost,
      workCenters: workCenters.data.length,
    };

    return NextResponse.json({
      success: true,
      metrics,
      workCenters: workCenters.data,
      sourceHealth: {
        payments: !payments.error,
        orders: !orders.error,
        tables: !tables.error,
        kitchenTickets: !kitchenTickets.error,
        shifts: !shifts.error,
        inventoryItems: !inventoryItems.error,
        payables: !payables.error,
        waste: !waste.error,
        workCenters: !workCenters.error,
      },
    });
  } catch (error) {
    console.error("command center error", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
