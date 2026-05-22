export const dynamic = "force-dynamic";

import { supabase } from "@/lib/shared/supabase/client";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const {
      table,
      items,
      total,
      staff_name,
      staff_id,
      tenant_id,
    } = body;

    if (!staff_id) {
      return Response.json(
        { error: "Missing staff_id" },
        { status: 400 }
      );
    }

    if (!tenant_id) {
      return Response.json(
        { error: "Missing tenant_id" },
        { status: 400 }
      );
    }

    if (!table) {
      return Response.json(
        { error: "Missing table" },
        { status: 400 }
      );
    }

    if (
      !items ||
      !Array.isArray(items) ||
      items.length === 0
    ) {

      return Response.json(
        { error: "No items" },
        { status: 400 }
      );

    }

    const now =
      new Date().toISOString();

    const {
      data: order,
      error: orderError,
    } = await supabase

      .from("orders")

      .insert([
        {

          tenant_id,

          table_number:
            table,

          total:
            Number(total || 0),

          status:
            "OPEN",

          kitchen_status:
            "PENDING",

          staff_name:
            staff_name || "Staff",

          staff_id,

          created_at:
            now,

        },
      ])

      .select()

      .single();

    if (
      orderError ||
      !order
    ) {

      console.error(
        orderError
      );

      return Response.json(
        {
          error:
            "Order creation failed",
        },
        {
          status: 500,
        }
      );

    }

    const orderItems = [];

    for (const item of items) {

      const qty =
        Number(
          item.quantity || 1
        );

      for (
        let i = 0;
        i < qty;
        i++
      ) {

        orderItems.push({

          tenant_id,

          order_id:
            order.id,

          dish_id:
            item.dish_id || null,

          item_name:

            item.item_name ||

            item.name ||

            item.dish_name ||

            item.title ||

            "Unnamed Item",

          quantity: 1,

          price:
            Number(
              item.price || 0
            ),

          station:

            item.station ||
            "HOT",

          status:
            "PENDING",

          staff_id,

          created_at:
            now,

        });

      }

    }

    const {
      error: itemsError,
    } = await supabase

      .from("order_items")

      .insert(
        orderItems
      );

    if (itemsError) {

      console.error(
        itemsError
      );

      return Response.json(
        {
          error:
            "Order items failed",
        },
        {
          status: 500,
        }
      );

    }

    return Response.json({

      success: true,

      order_id:
        order.id,

    });

  } catch (err) {

    console.error(err);

    return Response.json(
      {
        error:
          "Server error",
      },
      {
        status: 500,
      }
    );

  }

}
