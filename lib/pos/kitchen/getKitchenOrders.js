import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function getKitchenOrders({
  tenant_id,
}) {

  if (!tenant_id) {
    return {
      success: false,
      error: "Missing tenant_id",
    };
  }

  const {
    data: tickets,
    error: ticketsError,
  } = await supabaseAdmin
    .from("kitchen_tickets")
    .select("*")
    .eq("tenant_id", tenant_id)
    .order("created_at", {
      ascending: true,
    });

  if (ticketsError) {
    return {
      success: false,
      error: ticketsError.message,
    };
  }

  const ticketIds =
    (tickets || []).map(
      t => t.id
    );

  let items = [];

  if (ticketIds.length) {

    const result =
      await supabaseAdmin
        .from("kitchen_ticket_items")
        .select("*")
        .in(
          "kitchen_ticket_id",
          ticketIds
        );

    if (result.error) {
      return {
        success: false,
        error: result.error.message,
      };
    }

    items =
      result.data || [];
  }

  const data =
    (tickets || []).map(ticket => ({
      ...ticket,

      order_items:
        items.filter(
          item =>
            item.kitchen_ticket_id ===
            ticket.id
        ),
    }));

  return {
    success: true,
    data,
  };
}
