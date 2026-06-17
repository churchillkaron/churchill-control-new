export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  openTableSession,
} from "@/lib/restaurant/services/openTableSession";

import {
  recordSystemEvent,
} from "@/lib/events/recordSystemEvent";

import {
  SYSTEM_EVENTS,
} from "@/lib/shared/constants/events";

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

      customerId,
      customerName,
      customerEmail,
      customerPhone,
      guestCount,

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

    const session =
      await openTableSession({

        tenantId:
          tenant_id,

        tableNumber:
          table,

        customerId:
          customerId || null,

        customerName:
          customerName || null,

        customerEmail:
          customerEmail || null,

        customerPhone:
          customerPhone || null,

        guestCount:
          Number(guestCount || 0),

      });

    if (!session?.id) {

      return Response.json(
        {
          error:
            "Failed to open table session",
        },
        {
          status: 500,
        }
      );

    }

    const now =
      new Date().toISOString();

    const {
      data: order,
      error: orderError,
    } = await supabaseAdmin

      .from("orders")

      .insert([
        {

          tenant_id,

          table_number:
            table,

          session_id:
            session.id,

          total:
            Number(total || 0),

          status:
            "OPEN",

    
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

    await recordSystemEvent({
      tenantId: tenant_id,
      type: SYSTEM_EVENTS.ORDER_CREATED,
      payload: {
        order_id: order.id,
        session_id: session.id,
        table_number: table,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        total: Number(total || 0),
        created_at: now,
      },
    });

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
            item.dish_id ||
            item.id ||
            null,

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

          notes:
            item.notes || null,

          cooking_level:
            item.cookingLevel || null,

          created_at:
            now,

        });

      }

    }

    console.log(
      'ORDER_ITEMS_INSERT',
      JSON.stringify(orderItems, null, 2)
    )

    const {
      error: itemsError,
    } = await supabaseAdmin

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
