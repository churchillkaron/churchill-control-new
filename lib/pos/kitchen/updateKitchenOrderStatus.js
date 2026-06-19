import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function updateKitchenOrderStatus(body) {
  const {
    itemId,
    status,
    tenantId,
  } = body;

  if (!itemId || !status || !tenantId) {
    return {
      success: false,
      error: "Missing fields",
    };
  }

  const updates = {
    status,
  };

  if (status === "READY") {
    updates.ready_time =
      new Date().toISOString();
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("kitchen_ticket_items")
    .update(updates)
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  const ticketId =
    data?.kitchen_ticket_id;

  if (ticketId) {

    const {
      data: ticketItems,
      error: ticketError,
    } = await supabaseAdmin
      .from("kitchen_ticket_items")
      .select("status")
      .eq(
        "kitchen_ticket_id",
        ticketId
      );

    if (!ticketError) {

      let ticketStatus =
        "NEW";

      const statuses =
        (ticketItems || []).map(
          i => i.status
        );

      const allReady =
        statuses.length > 0 &&
        statuses.every(
          s =>
            s === "READY" ||
            s === "SERVED"
        );

      const anyPreparing =
        statuses.some(
          s => s === "PREPARING"
        );

      if (allReady) {
        ticketStatus = "READY";
      } else if (
        anyPreparing
      ) {
        ticketStatus =
          "PREPARING";
      }

      await supabaseAdmin
        .from("kitchen_tickets")
        .update({
          status: ticketStatus,
        })
        .eq(
          "id",
          ticketId
        );
    }
  }

  return {
    success: true,
    item: data,
  };
}
