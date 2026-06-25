import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function refreshPaymentReadModel({
  organizationId,
  paymentId,
}) {

  const { data, error } =
    await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", paymentId)
      .single();

  if (error) throw error;

  return data;
}
