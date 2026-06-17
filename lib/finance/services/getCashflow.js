import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getCachedFinance, setCachedFinance } from "@/lib/shared/cache/financeCache";

export async function getCashflow(tenant_id) {
  const cacheKey = `cashflow:${tenant_id}`;

  const cached = getCachedFinance(cacheKey);
  if (cached) return cached;

  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from("financial_transactions")
    .select("*")
    .eq("tenant_id", tenant_id);

  if (error) throw error;

  let inflow = 0;
  let outflow = 0;

  for (const row of data || []) {
    if (row.type === "income") inflow += row.amount || 0;
    if (row.type === "expense") outflow += row.amount || 0;
  }

  const result = {
    inflow,
    outflow,
    net: inflow - outflow,
    raw: data
  };

  setCachedFinance(cacheKey, result);

  return result;
}
