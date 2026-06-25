import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function refreshKitchenReadModel({
  organizationId,
  ticketId,
}) {

  const { data, error } =
    await supabaseAdmin
      .from("kitchen_tickets")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", ticketId)
      .single();

  if (error) throw error;

  return data;
}
