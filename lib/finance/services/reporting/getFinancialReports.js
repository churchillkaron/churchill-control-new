import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getCachedFinance, setCachedFinance } from "@/lib/shared/cache/financeCache";

export async function getFinancialReports(tenant_id) {
  const cacheKey = `reports:${tenant_id}`;

  const cached = getCachedFinance(cacheKey);
  if (cached) return cached;

  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from("financial_transactions")
    .select("*")
    .eq("tenant_id", tenant_id);

  if (error) throw error;

  const revenue = (data || [])
    .filter(t => t.type === "income")
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const expenses = (data || [])
    .filter(t => t.type === "expense")
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const result = {
    revenue,
    expenses,
    profit: revenue - expenses,
    count: data?.length || 0
  };

  setCachedFinance(cacheKey, result);

  return result;
}
