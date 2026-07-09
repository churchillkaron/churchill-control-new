import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function getFinanceSummary({ organizationId }) {
  const { data, error } = await supabaseAdmin
    .from("order_profit_view")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) throw error;

  return {
    success: true,
    data: data || [],
  };
}
