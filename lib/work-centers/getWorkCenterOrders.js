import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getWorkCenterOrders({
  organizationId,
  organization_id,
  workCenterId = null,
}) {
  const resolvedOrganizationId = organizationId || organization_id;

  if (!resolvedOrganizationId) {
    return {
      success: false,
      error: "Missing organizationId",
      data: [],
    };
  }

  let query = supabaseAdmin
    .from("kitchen_tickets")
    .select("*")
    .eq("organization_id", resolvedOrganizationId)
    .order("created_at", { ascending: true });

  if (workCenterId) {
    query = query.eq("work_center_id", workCenterId);
  }

  const { data: tickets, error } = await query;

  if (error) {
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }

  const data = (tickets || []).map((ticket) => ({
    ...ticket,
    work_center: ticket.work_center_id
      ? {
          id: ticket.work_center_id,
          name: ticket.station || null,
        }
      : null,
    order_items: Array.isArray(ticket.items) ? ticket.items : [],
  }));

  return {
    success: true,
    data,
  };
}
