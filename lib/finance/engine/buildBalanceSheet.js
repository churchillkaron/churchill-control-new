import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getCachedFinance, setCachedFinance } from "@/lib/shared/cache/financeCache";

export async function buildBalanceSheet(tenant_id) {
  const cacheKey = `bs:${tenant_id}`;

  const cached = getCachedFinance(cacheKey);
  if (cached) return cached;

  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from("financial_transactions")
    .select("*")
    .eq("tenant_id", tenant_id);

  if (error) throw error;

  const result = {
    assets: 0,
    liabilities: 0,
    equity: 0,
    raw: data
  };

  for (const row of data || []) {
    if (row.category === "asset") result.assets += row.amount || 0;
    if (row.category === "liability") result.liabilities += row.amount || 0;
    if (row.category === "equity") result.equity += row.amount || 0;
  }

  setCachedFinance(cacheKey, result);

  return result;
}
