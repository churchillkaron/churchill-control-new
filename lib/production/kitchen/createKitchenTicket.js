import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createKitchenTicket({
  tenant_id,
  order_id,
  table_number,
  items = [],
}) {

  try {

    const {
      data: ticket,
      error: ticketError,
    } = await supabaseAdmin
      .from("kitchen_tickets")
      .insert([
        {

          tenant_id,

          order_id,

          table_number,

          status:
            "PENDING",

          created_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (ticketError) {
      throw ticketError;
    }

    const stationItems =
      items.map((item) => ({

        tenant_id,

        kitchen_ticket_id:
          ticket.id,

        item_name:
          item.item_name,

        quantity:
          item.quantity,

        station:
          item.station ||
          "MAIN",

        status:
          "PENDING",

        fire_time:
          null,
      }));

    const {
      error: itemError,
    } = await supabaseAdmin
      .from(
        "kitchen_ticket_items"
      )
      .insert(
        stationItems
      );

    if (itemError) {
      throw itemError;
    }

    return {

      success: true,

      ticket,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
