import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listIntercompanyTransactions({
  organization_id,
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const { data, error } = await supabaseAdmin
    .from("intercompany_transactions")
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}
