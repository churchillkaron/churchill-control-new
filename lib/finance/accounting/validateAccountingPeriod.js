import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function validateAccountingPeriod({
  organizationId,
  entityId,
  postingDate,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!entityId) {
    throw new Error("entityId required");
  }

  if (!postingDate) {
    throw new Error("postingDate required");
  }

  const { data, error } =
    await supabaseAdmin
      .from("accounting_periods")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .lte("start_date", postingDate)
      .gte("end_date", postingDate)
      .single();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(
      "Accounting period not found"
    );
  }

  if (
    ["CLOSED", "LOCKED"].includes(
      String(data.status).toUpperCase()
    )
  ) {
    throw new Error(
      `Accounting period ${data.status}`
    );
  }

  return data;
}
