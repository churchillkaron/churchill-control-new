export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  loadAccountingFirmDashboard,
} from "@/lib/accounting/loadAccountingFirmDashboard";

import {
  loadAccountingClients,
} from "@/lib/accounting/loadAccountingClients";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  generateWorkspaceNarrative,
} from "@/lib/platform/workspaces/generateWorkspaceNarrative";




function sumRows(rows, field) {
  return (rows || []).reduce(
    (sum, row) =>
      sum + Number(row?.[field] || 0),
    0
  );
}

async function safeQuery(query) {
  const result = await query;
  return {
    data: result.data || [],
    error: result.error || null,
  };
}

export async function GET(request) {
  try {
    const { searchParams } =
      new URL(request.url);

    const organizationId =
      searchParams.get(
        "organizationId"
      );

    const organizationType =
      searchParams.get(
        "organizationType"
      );

    const access =
      await requireOrganizationAccess({

        organizationId,

      });

    if (!access.success) {

      return NextResponse.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const tenantId =
      access.tenantId;

    if (
      organizationType ===
      "accounting_firm"
    ) {

      const metrics =
        await loadAccountingFirmDashboard({

          organizationId,

        });

      const clients =
        await loadAccountingClients({

          organizationId,

        });

      return NextResponse.json({

        success: true,

        metrics,

        clients,

      });

    }

    if (!tenantId) {
      return NextResponse.json({
        success: false,
        error: "Missing tenantId",
      }, { status: 400 });
    }

    const today =
      new Date();

    today.setHours(0, 0, 0, 0);

    const [
      payments,
      orders,
      tables,
      orderItems,
      shifts,
      ingredients,
      payables,
      waste,
    ] = await Promise.all([
      safeQuery(
        supabaseAdmin
          .from('payment_transactions')
          .select("*")
          .eq("tenant_id", tenantId)
          .gte("created_at", today.toISOString())
      ),

      safeQuery(
        supabaseAdmin
          .from("orders")
          .select("*")
          .eq("tenant_id", tenantId)
          .gte("created_at", today.toISOString())
      ),

      safeQuery(
        supabaseAdmin
          .from("restaurant_tables")
          .select("*")
          .eq("tenant_id", tenantId)
      ),

      safeQuery(
        supabaseAdmin
          .from("order_items")
          .select("*")
          .eq("tenant_id", tenantId)
      ),

      safeQuery(
        supabaseAdmin
          .from("pos_shifts")
          .select("*")
          .eq("tenant_id", tenantId)
      ),

      safeQuery(
        supabaseAdmin
          .from("ingredients")
          .select("*")
          .eq("tenant_id", tenantId)
      ),

      safeQuery(
        supabaseAdmin
          .from("accounts_payable")
          .select("*")
          .eq("tenant_id", tenantId)
      ),

      safeQuery(
        supabaseAdmin
          .from("production_waste_logs")
          .select("*")
          .eq("tenant_id", tenantId)
      ),
    ]);

    const revenue =
      sumRows(payments.data, "total");

    const openOrders =
      (orders.data || []).filter(
        order =>
          !["PAID", "CLOSED", "CANCELLED", "VOID"].includes(
            String(order.status || "").toUpperCase()
          )
      );

    const paidOrders =
      (orders.data || []).filter(
        order =>
          String(order.status || "").toUpperCase() === "PAID"
      );

    const occupiedTables =
      (tables.data || []).filter(
        table =>
          ["OCCUPIED", "ACTIVE"].includes(
            String(table.status || "").toUpperCase()
          )
      );

    const operationsQueue =
      (orderItems.data || []).filter(
        item =>
          !["READY", "SERVED", "CANCELLED", "VOID"].includes(
            String(item.status || "").toUpperCase()
          )
      );

    const activeStaff =
      (shifts.data || []).filter(
        shift =>
          ["OPEN", "ACTIVE"].includes(
            String(shift.status || "").toUpperCase()
          )
      );

    const lowStock =
      (ingredients.data || []).filter(
        ingredient =>
          Number(ingredient.stock || 0) <=
          Number(ingredient.minimum_stock || 0)
      );

    const pendingPayables =
      (payables.data || []).filter(
        payable =>
          String(payable.status || "").toUpperCase() !== "PAID"
      );

    const pendingPayablesAmount =
      sumRows(pendingPayables, "amount");

    const wasteCost =
      sumRows(waste.data, "estimated_cost");

    const averageOrder =
      paidOrders.length > 0
        ? revenue / paidOrders.length
        : 0;

    const serviceCharge =
      revenue * 0.05;

    const narrative =
      await generateWorkspaceNarrative({

        organization: {
          id:
            organizationId,

          name:
            organizationId,

          organization_type:
            organizationType,
        },

        industry:
          organizationType,

        metrics: {

          revenue,

          serviceCharge,

          totalOrders:
            orders.data.length,

          openOrders:
            openOrders.length,

          paidOrders:
            paidOrders.length,

          averageOrder,

          occupiedTables:
            occupiedTables.length,

          totalTables:
            tables.data.length,

          operationsQueue:
            operationsQueue.length,

          activeStaff:
            activeStaff.length,

          lowStockAlerts:
            lowStock.length,

          pendingPayables:
            pendingPayables.length,

          pendingPayablesAmount,

          wasteCost,

        },

        alerts: [

          lowStock.length > 0
            ? `${lowStock.length} low stock alerts`
            : null,

          operationsQueue.length > 5
            ? `Operations queue ${operationsQueue.length}`
            : null,

          pendingPayables.length > 0
            ? `${pendingPayables.length} unpaid payables`
            : null,

        ].filter(Boolean),

      });

    return NextResponse.json({
      success: true,

      narrative,

      metrics: {
        revenue,
        serviceCharge,
        totalOrders: orders.data.length,
        openOrders: openOrders.length,
        paidOrders: paidOrders.length,
        averageOrder,
        occupiedTables: occupiedTables.length,
        totalTables: tables.data.length,
        operationsQueue: operationsQueue.length,
        activeStaff: activeStaff.length,
        lowStockAlerts: lowStock.length,
        pendingPayables: pendingPayables.length,
        pendingPayablesAmount,
        wasteCost,
      },
      sourceHealth: {
        payments: !payments.error,
        orders: !orders.error,
        tables: !tables.error,
        orderItems: !orderItems.error,
        shifts: !shifts.error,
        ingredients: !ingredients.error,
        payables: !payables.error,
        waste: !waste.error,
      },
    });
  } catch (error) {
    console.error("command center error", error);

    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
