import { supabase } from "@/lib/supabase";

export async function getCloseChecklistStatus({
  tenantId,
  accountingPeriodId,
}) {
  const { data, error } = await supabase
    .from("accounting_close_checklists")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq(
      "accounting_period_id",
      accountingPeriodId
    )
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  const completed =
    (data || []).filter(
      (item) => item.completed
    ).length;

  const total = (data || []).length;

  return {
    checklist: data || [],
    progress: {
      completed,
      total,
      percentage:
        total > 0
          ? Math.round(
              (completed / total) * 100
            )
          : 0,
    },
  };
}
