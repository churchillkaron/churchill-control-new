export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

import { createCogsEntry } from "@/lib/finance/createCogsEntry";
import { consumeDishStock } from "@/lib/production/consumeDishStock";

export async function POST(req) {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return Response.json(
        {
          success: false,
          error: "Missing Supabase environment variables",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceKey
    );

    const {
      order_id,
      status,
      tenant_id,
    } = await req.json();

    if (!tenant_id) {
      return Response.json(
        {
          success: false,
          error: "Missing tenant_id",
        },
        { status: 400 }
      );
    }

    if (!order_id || !status) {
      return Response.json(
        {
          success: false,
          error: "Missing data",
        },
        { status: 400 }
      );
    }

    const normalizedStatus =
      String(status).toLowerCase();

    // =========================
    // NON-DONE STATUS UPDATE
    // =========================

    if (normalizedStatus !== "done") {
      const { error: statusError } =
        await supabase
          .from("orders")
          .update({
            kitchen_status: normalizedStatus,
          })
          .eq("id", order_id)
          .eq("tenant_id", tenant_id);

      if (statusError) throw statusError;

      return Response.json({
        success: true,
        processed: false,
      });
    }

    // =========================
    // IDEMPOTENCY CHECK
    // Prevent double stock / COGS posting
    // =========================

    const {
      data: existingMovements,
      error: existingMovementError,
    } = await supabase
      .from("stock_movements")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("reference_id", order_id)
      .eq("movement_type", "SALE")
      .limit(1);

    if (existingMovementError) {
      throw existingMovementError;
    }

    if ((existingMovements || []).length > 0) {
      const { error: readyError } =
        await supabase
          .from("orders")
          .update({
            kitchen_status: "ready",
          })
          .eq("id", order_id)
          .eq("tenant_id", tenant_id);

      if (readyError) throw readyError;

      return Response.json({
        success: true,
        already_processed: true,
      });
    }

    // =========================
    // LOAD ORDER ITEMS
    // =========================

    const {
      data: items,
      error: itemsError,
    } = await supabase
      .from("order_items")
      .select(`
        dish_id,
        quantity,
        price
      `)
      .eq("order_id", order_id)
      .eq("tenant_id", tenant_id);

    if (itemsError) throw itemsError;

    if (!items || items.length === 0) {
      return Response.json(
        {
          success: false,
          error: "NO_ORDER_ITEMS_FOUND",
        },
        { status: 400 }
      );
    }

    // =========================
    // GROUP ITEMS BY DISH
    // One stock deduction per dish
    // =========================

    const groupedItems = {};

    for (const item of items) {
      const key = item.dish_id;

      if (!key) continue;

      if (!groupedItems[key]) {
        groupedItems[key] = {
          dish_id: item.dish_id,
          quantity: 0,
          revenue: 0,
        };
      }

      const itemQty =
        Number(item.quantity || 1);

      groupedItems[key].quantity += itemQty;

      groupedItems[key].revenue +=
        Number(item.price || 0) * itemQty;
    }

    const groupedList =
      Object.values(groupedItems);

    if (groupedList.length === 0) {
      return Response.json(
        {
          success: false,
          error: "NO_VALID_DISH_ITEMS_FOUND",
        },
        { status: 400 }
      );
    }

    // =========================
    // SALES CONSUMPTION + COGS
    // =========================

    const results = [];

    for (const item of groupedList) {
      const stockResult =
        await consumeDishStock({
          tenantId: tenant_id,
          dishId: item.dish_id,
          quantity: Number(item.quantity || 0),
          referenceId: order_id,
          source: "ORDER_COMPLETED",
        });

      if (!stockResult.success) {
        return Response.json(
          {
            success: false,
            error: "Stock deduction failed",
            detail: stockResult.error,
            dish_id: item.dish_id,
          },
          { status: 500 }
        );
      }

      const cogsResult =
        await createCogsEntry({
          tenantId: tenant_id,
          orderId: order_id,
          dishId: item.dish_id,
          quantity: Number(item.quantity || 0),
          revenueAmount: Number(item.revenue || 0),
        });

      if (!cogsResult.success) {
        console.error(
          "COGS CREATION FAILED FULL:",
          JSON.stringify(
            cogsResult,
            null,
            2
          )
        );
      }

      results.push({
        dish_id: item.dish_id,
        quantity: item.quantity,
        revenue: item.revenue,
        stock: stockResult,
        cogs: cogsResult,
      });
    }

    // =========================
    // MARK ORDER READY
    // Only after stock + COGS flow
    // =========================

    const { error: updateError } =
      await supabase
        .from("orders")
        .update({
          kitchen_status: "ready",
        })
        .eq("id", order_id)
        .eq("tenant_id", tenant_id);

    if (updateError) throw updateError;

    return Response.json({
      success: true,
      processed: true,
      results,
    });

  } catch (err) {
    console.error(
      "KITCHEN ERROR:",
      err
    );

    return Response.json(
      {
        success: false,
        error:
          err.message || "Kitchen error",
      },
      { status: 500 }
    );
  }
}
