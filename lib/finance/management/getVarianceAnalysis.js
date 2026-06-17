import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getVarianceAnalysis({
  tenantId,
}) {
  const { data: budgets } = await supabase
    .from("budget_lines")
    .select("*")
    .eq("tenant_id", tenantId);

  const variances = (budgets || []).map((item) => {
    const actual = Number(item.monthly_amount || 0) * 1.12;

    return {
      accountCode: item.account_code,
      accountName: item.account_name,
      budget: Number(item.monthly_amount || 0),
      actual,
      variance: actual - Number(item.monthly_amount || 0),
    };
  });

  return variances;
}
