import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { getActiveTableSession } from "./getActiveTableSession";

export async function openTableSession({
  organizationId = null,

  tableId = null,
  tableNumber = null,

  customerId = null,
  customerName = null,
  customerEmail = null,
  customerPhone = null,

  guestCount = 0,
}) {
  const supabase = getServiceSupabase();

  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const existing = await getActiveTableSession({
    organizationId,
    tableId,
    tableNumber,
  });

  if (existing) {
    const finalGuestCount = Number(
      guestCount || existing.guest_count || existing.guests || 0
    );

    const { data, error } = await supabase
      .from("table_sessions")
      .update({
        organization_id: organizationId || existing.organization_id || null,
        
        customer_id: customerId ?? existing.customer_id,
        customer_name: customerName ?? existing.customer_name,
        customer_email: customerEmail ?? existing.customer_email,
        customer_phone: customerPhone ?? existing.customer_phone,

        guest_count: finalGuestCount,
        guests: finalGuestCount,

        table_id: tableId || existing.table_id,
        table_number: tableNumber || existing.table_number,

        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  let tableQuery = supabase
    .from("restaurant_tables")
    .select("*");

  if (organizationId) {
    tableQuery = tableQuery.eq(
      "organization_id",
      organizationId
    );
  }

  const { data: tables, error: tableError } = tableId
    ? await tableQuery.eq("id", tableId).limit(1)
    : await tableQuery.eq("table_number", tableNumber).limit(1);

  if (tableError || !tables?.length) {
    throw new Error("Restaurant table not found");
  }

  const table = tables[0];
  const finalGuestCount = Number(guestCount || 0);

  const { data, error } = await supabase
    .from("table_sessions")
    .insert({
      organization_id: organizationId || table.organization_id || null,
      
      customer_id: customerId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,

      table_id: table.id,
      table_number: table.table_number,

      guest_count: finalGuestCount,
      guests: finalGuestCount,

      status: "OPEN",
      revenue: 0,
      orders: 0,

      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("restaurant_tables")
    .update({
      status: "OCCUPIED",
      current_guests: finalGuestCount,
      active_session_id: data.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", table.id);

  return data;
}
