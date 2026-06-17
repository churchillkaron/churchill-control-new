import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getCachedFinance, setCachedFinance } from "@/lib/shared/cache/financeCache";

export async function buildProfitLoss(tenant_id) {
  const cacheKey = `pl:${tenant_id}`;

  const cached = getCachedFinance(cacheKey);
  if (cached) return cached;

  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from("financial_transactions")
    .select("*")
    .eq("tenant_id", tenant_id);

  if (error) throw error;

  const result = {
    revenue: 0,
    expenses: 0,
    profit: 0,
    raw: data
  };

  for (const row of data || []) {
    if (row.type === "income") result.revenue += row.amount || 0;
    if (row.type === "expense") result.expenses += row.amount || 0;
  }

  result.profit = result.revenue - result.expenses;

  setCachedFinance(cacheKey, result);

  return result;
}
