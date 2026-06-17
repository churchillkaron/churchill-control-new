import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getCachedFinance, setCachedFinance } from "@/lib/shared/cache/financeCache";

export async function getGeneralLedger(tenant_id) {
  const cacheKey = `ledger:${tenant_id}`;

  const cached = getCachedFinance(cacheKey);
  if (cached) return cached;

  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from("financial_transactions")
    .select("*")
    .eq("tenant_id", tenant_id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const result = {
    entries: data || [],
    total: data?.length || 0
  };

  setCachedFinance(cacheKey, result);

  return result;
}
