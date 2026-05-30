import { supabase } from "@/lib/supabase";

export async function getCashPosition({
  tenantId,
}) {
  const { data, error } =
    await supabase
      .from("bank_accounts")
      .select("*")
      .eq("tenant_id", tenantId);

  if (error) {
    throw error;
  }

  let totalCash = 0;

  for (const account of data || []) {
    totalCash += Number(
      account.current_balance || 0
    );
  }

  return {
    totalCash,
    accounts: data || [],
  };
}
