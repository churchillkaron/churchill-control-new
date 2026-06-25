import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function refreshOrderReadModel({
  organizationId,
  orderId,
}) {

  const { data, error } =
    await supabaseAdmin
      .from("orders")
      .select(`
        *,
        order_items(*)
      `)
      .eq("organization_id", organizationId)
      .eq("id", orderId)
      .single();

  if (error) throw error;

  return data;
}
