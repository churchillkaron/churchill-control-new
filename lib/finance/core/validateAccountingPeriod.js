import { supabase } from "@/lib/supabase";

export async function validateAccountingPeriod({
  tenantId,
  entryDate,
}) {
  const { data, error } = await supabase
    .from("accounting_periods")
    .select("*")
    .eq("tenant_id", tenantId)
    .lte("start_date", entryDate)
    .gte("end_date", entryDate)
    .single();

  if (error || !data) {
    throw new Error("No accounting period found");
  }

  if (data.status === "closed") {
    throw new Error("Accounting period is closed");
  }

  return data;
}
