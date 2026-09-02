export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TERMINAL_STATUSES = new Set([
  "cancelled",
  "closed",
  "complete",
  "completed",
  "fulfilled",
  "received",
  "rejected",
  "void",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function titleCase(value) {
  return clean(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTerminal(value) {
  return TERMINAL_STATUSES.has(normalized(value));
}

function isToday(value, today) {
  return Boolean(value && String(value).slice(0, 10) === today);
}

function isPast(value, today) {
  return Boolean(value && String(value).slice(0, 10) < today);
}

function entityScoped(query, entityId, column = "entity_id") {
  if (!entityId) return query;
  return query.or(`${column}.eq.${entityId},${column}.is.null`);
}

async function safe(source, task, fallback) {
  try {
    return {
      source,
      status: "connected",
      data: await task(),
      error: null,
    };
  } catch (error) {
    console.error("SUPPLY_CHAIN_COMMAND_CENTER_SOURCE_FAILED", {
      source,
      error,
    });
    return {
      source,
      status: "error",
      data: fallback,
      error: error?.message || "Source unavailable",
    };
  }
}

function supplyHref(path) {
  const cleanPath = clean(path).replace(/^\/+/, "");
  return `/supply-chain/${cleanPath}`;
}

function latestValuation(rows) {
  const latestByItem = new Map();

  for (const row of rows || []) {
    const key = row.item_id || row.id;
    if (!key) continue;
    const current = latestByItem.get(key);
    const rowDate = String(row.snapshot_date || row.created_at || "");
    const currentDate = String(current?.snapshot_date || current?.created_at || "");
    if (!current || rowDate > currentDate) latestByItem.set(key, row);
  }

  return [...latestByItem.values()];
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") ||
        url.searchParams.get("organization_id"),
    );
    const entityId = clean(
      url.searchParams.get("entityId") || url.searchParams.get("entity_id"),
    );
    const periodId = clean(
      url.searchParams.get("periodId") || url.searchParams.get("period_id"),
    );

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
      request,
      access,
    });

    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 400 },
      );
    }

    const resolvedEntityId = context.entityId || null;
    const today = new Date().toISOString().slice(0, 10);

    const [
      itemsSource,
      warehousesSource,
      inventorySource,
      alertsSource,
      reservationsSource,
      valuationsSource,
      requestsSource,
      purchaseOrdersSource,
      receiptsSource,
      warehouseTasksSource,
      transfersSource,
      suppliersSource,
    ] = await Promise.all([
      safe("inventory_items", async () => {
        let query = supabaseAdmin
          .from("inventory_items")
          .select("id, entity_id, name, code, cost, is_active")
          .eq("organization_id", context.organizationId)
          .eq("is_active", true);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query.limit(5000);
        if (error) throw error;
        return data || [];
      }, []),
      safe("inventory_warehouses", async () => {
        const { data, error } = await supabaseAdmin
          .from("inventory_warehouses")
          .select("id, name")
          .eq("organization_id", context.organizationId)
          .limit(500);
        if (error) throw error;
        return data || [];
      }, []),
      safe("warehouse_inventory", async () => {
        const { data, error } = await supabaseAdmin
          .from("warehouse_inventory")
          .select("id, item_id, warehouse_location_id, quantity, minimum_quantity, updated_at")
          .eq("organization_id", context.organizationId)
          .limit(10000);
        if (error) throw error;
        return data || [];
      }, []),
      safe("inventory_alerts", async () => {
        let query = supabaseAdmin
          .from("inventory_alerts")
          .select("id, entity_id, item_id, alert_type, current_quantity, minimum_quantity, message, created_at")
          .eq("organization_id", context.organizationId)
          .eq("resolved", false);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query
          .order("created_at", { ascending: false })
          .limit(250);
        if (error) throw error;
        return data || [];
      }, []),
      safe("inventory_reservations", async () => {
        let query = supabaseAdmin
          .from("inventory_reservations")
          .select("id, entity_id, item_id, quantity, status, source_document, reserved_at, created_at")
          .eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query
          .order("created_at", { ascending: false })
          .limit(5000);
        if (error) throw error;
        return data || [];
      }, []),
      safe("inventory_valuation_snapshots", async () => {
        let query = supabaseAdmin
          .from("inventory_valuation_snapshots")
          .select("id, entity_id, item_id, snapshot_date, quantity_on_hand, inventory_value, average_unit_cost, created_at")
          .eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query
          .order("snapshot_date", { ascending: false })
          .limit(10000);
        if (error) throw error;
        return data || [];
      }, []),
      safe("purchase_requests", async () => {
        let query = supabaseAdmin
          .from("purchase_requests")
          .select("id, entity_id, request_number, title, priority, estimated_cost, status, needed_by, requested_by, created_at")
          .eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query
          .order("created_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        return data || [];
      }, []),
      safe("purchase_orders", async () => {
        let query = supabaseAdmin
          .from("purchase_orders")
          .select("id, entity_id, po_number, supplier_party_id, status, total_amount, currency, expected_delivery_date, warehouse_id, created_at")
          .eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query
          .order("created_at", { ascending: false })
          .limit(2500);
        if (error) throw error;
        return data || [];
      }, []),
      safe("goods_receipts", async () => {
        let query = supabaseAdmin
          .from("goods_receipts")
          .select("id, entity_id, grn_number, purchase_order_id, supplier_party_id, status, received_date, warehouse_id, created_at")
          .eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query
          .order("created_at", { ascending: false })
          .limit(2500);
        if (error) throw error;
        return data || [];
      }, []),
      safe("warehouse_tasks", async () => {
        let query = supabaseAdmin
          .from("warehouse_tasks")
          .select("id, entity_id, warehouse_id, task_type, source_document, item_id, quantity, status, assigned_to, created_at, started_at, completed_at")
          .eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query
          .order("created_at", { ascending: false })
          .limit(2500);
        if (error) throw error;
        return data || [];
      }, []),
      safe("warehouse_transfers", async () => {
        const { data, error } = await supabaseAdmin
          .from("warehouse_transfers")
          .select("id, item_id, quantity, transfer_status, transferred_at, approved_at, created_at")
          .eq("organization_id", context.organizationId)
          .order("created_at", { ascending: false })
          .limit(2500);
        if (error) throw error;
        return data || [];
      }, []),
      safe("supplier_profiles", async () => {
        const { data, error } = await supabaseAdmin
          .from("supplier_profiles")
          .select("id, party_id, vendor_code, risk_level, is_active, is_blocked, payment_terms, created_at")
          .eq("organization_id", context.organizationId)
          .eq("is_active", true)
          .limit(2500);
        if (error) throw error;
        return data || [];
      }, []),
    ]);

    const items = itemsSource.data || [];
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const warehouses = warehousesSource.data || [];
    const inventory = inventorySource.data || [];
    const alerts = alertsSource.data || [];
    const reservations = reservationsSource.data || [];
    const valuations = latestValuation(valuationsSource.data || []);
    const requests = requestsSource.data || [];
    const purchaseOrders = purchaseOrdersSource.data || [];
    const receipts = receiptsSource.data || [];
    const warehouseTasks = warehouseTasksSource.data || [];
    const transfers = transfersSource.data || [];
    const suppliers = suppliersSource.data || [];

    const openRequests = requests.filter((row) => !isTerminal(row.status));
    const openPurchaseOrders = purchaseOrders.filter((row) => !isTerminal(row.status));
    const overduePurchaseOrders = openPurchaseOrders.filter((row) =>
      isPast(row.expected_delivery_date, today),
    );
    const dueTodayPurchaseOrders = openPurchaseOrders.filter((row) =>
      isToday(row.expected_delivery_date, today),
    );
    const openReceipts = receipts.filter((row) => !isTerminal(row.status));
    const openWarehouseTasks = warehouseTasks.filter((row) => !isTerminal(row.status));
    const unassignedWarehouseTasks = openWarehouseTasks.filter((row) => !row.assigned_to);
    const activeReservations = reservations.filter((row) =>
      ["active", "open", "reserved"].includes(normalized(row.status)),
    );
    const openTransfers = transfers.filter((row) => !isTerminal(row.transfer_status));
    const riskySuppliers = suppliers.filter((row) =>
      row.is_blocked || ["high", "critical"].includes(normalized(row.risk_level)),
    );

    const derivedShortages = inventory.filter((row) => {
      const minimum = numeric(row.minimum_quantity);
      return minimum > 0 && numeric(row.quantity) < minimum;
    });
    const shortageItemIds = new Set([
      ...alerts.map((row) => row.item_id).filter(Boolean),
      ...derivedShortages.map((row) => row.item_id).filter(Boolean),
    ]);

    const valuationAmount = valuations.reduce(
      (sum, row) => sum + numeric(row.inventory_value),
      0,
    );
    const reservedQuantity = activeReservations.reduce(
      (sum, row) => sum + numeric(row.quantity),
      0,
    );
    const purchaseCommitment = openPurchaseOrders.reduce(
      (sum, row) => sum + numeric(row.total_amount),
      0,
    );

    const queue = [];

    alerts.slice(0, 6).forEach((row) => {
      const item = itemMap.get(row.item_id);
      queue.push({
        id: `alert:${row.id}`,
        kind: "shortage",
        priority: "attention",
        title: item?.name || titleCase(row.alert_type || "Inventory alert"),
        detail:
          row.message ||
          `Available ${numeric(row.current_quantity)} · Minimum ${numeric(row.minimum_quantity)}`,
        status: row.alert_type || "Open",
        href: supplyHref("inventory/replenishment"),
      });
    });

    if (!alerts.length) {
      derivedShortages.slice(0, 6).forEach((row) => {
        const item = itemMap.get(row.item_id);
        queue.push({
          id: `shortage:${row.id}`,
          kind: "shortage",
          priority: "attention",
          title: item?.name || "Inventory shortage",
          detail: `Available ${numeric(row.quantity)} · Minimum ${numeric(row.minimum_quantity)}`,
          status: "Below minimum",
          href: supplyHref("inventory/replenishment"),
        });
      });
    }

    overduePurchaseOrders.slice(0, 5).forEach((row) => {
      queue.push({
        id: `po:${row.id}`,
        kind: "inbound",
        priority: "attention",
        title: row.po_number || "Purchase order",
        detail: row.expected_delivery_date
          ? `Expected ${row.expected_delivery_date}`
          : "Expected delivery date missing",
        status: row.status || "Open",
        href: supplyHref("procurement/purchase-orders"),
      });
    });

    openRequests
      .filter((row) =>
        isPast(row.needed_by, today) ||
        ["high", "critical", "urgent"].includes(normalized(row.priority)),
      )
      .slice(0, 4)
      .forEach((row) => {
        queue.push({
          id: `request:${row.id}`,
          kind: "purchase_request",
          priority: isPast(row.needed_by, today) ? "attention" : "review",
          title: row.request_number || row.title || "Purchase request",
          detail: row.needed_by ? `Needed ${row.needed_by}` : titleCase(row.priority || "Priority request"),
          status: row.status || "Open",
          href: supplyHref("procurement/requests"),
        });
      });

    unassignedWarehouseTasks.slice(0, 5).forEach((row) => {
      const item = itemMap.get(row.item_id);
      queue.push({
        id: `task:${row.id}`,
        kind: "warehouse",
        priority: "review",
        title: titleCase(row.task_type || "Warehouse task"),
        detail: [item?.name, numeric(row.quantity) || null].filter(Boolean).join(" · "),
        status: row.status || "Open",
        href: supplyHref("warehouse/tasks"),
      });
    });

    riskySuppliers.slice(0, 4).forEach((row) => {
      queue.push({
        id: `supplier:${row.id}`,
        kind: "supplier",
        priority: row.is_blocked ? "attention" : "review",
        title: row.vendor_code || "Supplier risk",
        detail: row.is_blocked ? "Supplier is blocked" : `${titleCase(row.risk_level)} risk supplier`,
        status: row.is_blocked ? "Blocked" : row.risk_level || "Risk",
        href: supplyHref("procurement/suppliers"),
      });
    });

    const sources = Object.fromEntries(
      [
        itemsSource,
        warehousesSource,
        inventorySource,
        alertsSource,
        reservationsSource,
        valuationsSource,
        requestsSource,
        purchaseOrdersSource,
        receiptsSource,
        warehouseTasksSource,
        transfersSource,
        suppliersSource,
      ].map((source) => [
        source.source,
        { status: source.status, error: source.error },
      ]),
    );

    return NextResponse.json({
      success: true,
      ready: true,
      context: {
        organization_id: context.organizationId,
        entity_id: resolvedEntityId,
        period_id: context.periodId || null,
        period_start: context.period?.start_date || null,
        period_end: context.period?.end_date || null,
        currency: context.currency || null,
      },
      metrics: {
        inventory: {
          active_items: items.length,
          warehouses: warehouses.length,
          shortage_items: shortageItemIds.size,
          value: valuationAmount,
          source_status:
            itemsSource.status === "error" || inventorySource.status === "error"
              ? "error"
              : "connected",
        },
        purchasing: {
          open_requests: openRequests.length,
          open_orders: openPurchaseOrders.length,
          commitment: purchaseCommitment,
          overdue_orders: overduePurchaseOrders.length,
          due_today_orders: dueTodayPurchaseOrders.length,
          source_status:
            requestsSource.status === "error" || purchaseOrdersSource.status === "error"
              ? "error"
              : "connected",
        },
        receiving: {
          open_receipts: openReceipts.length,
          source_status: receiptsSource.status,
        },
        warehouse: {
          open_tasks: openWarehouseTasks.length,
          unassigned_tasks: unassignedWarehouseTasks.length,
          open_transfers: openTransfers.length,
          source_status:
            warehouseTasksSource.status === "error" || transfersSource.status === "error"
              ? "error"
              : "connected",
        },
        reservations: {
          active: activeReservations.length,
          quantity: reservedQuantity,
          source_status: reservationsSource.status,
        },
        suppliers: {
          active: suppliers.length,
          at_risk: riskySuppliers.length,
          source_status: suppliersSource.status,
        },
      },
      flow: [
        {
          id: "plan",
          label: "Plan & replenish",
          count: shortageItemIds.size,
          detail: "Shortage and replenishment signals",
          href: supplyHref("inventory/replenishment"),
        },
        {
          id: "buy",
          label: "Buy",
          count: openRequests.length + openPurchaseOrders.length,
          detail: `${openRequests.length} requests · ${openPurchaseOrders.length} open POs`,
          href: supplyHref("procurement/purchase-orders"),
        },
        {
          id: "receive",
          label: "Receive",
          count: openReceipts.length + overduePurchaseOrders.length,
          detail: `${overduePurchaseOrders.length} overdue inbound`,
          href: supplyHref("procurement/goods-receipts"),
        },
        {
          id: "move",
          label: "Put away & move",
          count: openWarehouseTasks.length + openTransfers.length,
          detail: `${unassignedWarehouseTasks.length} unassigned tasks`,
          href: supplyHref("warehouse/tasks"),
        },
        {
          id: "control",
          label: "Count & control",
          count: alerts.length,
          detail: "Stock accuracy and exception control",
          href: supplyHref("inventory/counts"),
        },
      ],
      queue: queue.slice(0, 16),
      sources,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("SUPPLY_CHAIN_COMMAND_CENTER_FAILED", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load Supply Chain command center",
      },
      { status: 500 },
    );
  }
}
