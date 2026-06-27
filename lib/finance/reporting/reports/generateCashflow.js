import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function generateCashflow({
  organizationId,
}) {
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) {
    throw error;
  }

  let inflow = 0;
  let outflow = 0;

  for (const tx of data || []) {
    const amount = Number(tx.amount || 0);

    if (tx.type === "deposit") {
      inflow += amount;
    }

    if (tx.type === "withdrawal") {
      outflow += amount;
    }
  }

  return {
    inflow,
    outflow,
    netCashflow: inflow - outflow,
  };
}
