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
      .select(
        "id,status,start_date,end_date"
      )
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "entity_id",
        entityId
      )
      .lte(
        "start_date",
        postingDate
      )
      .gte(
        "end_date",
        postingDate
      )
      .order(
        "start_date",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(
      "No accounting period covers posting date"
    );
  }

  const status =
    String(data.status || "")
      .toLowerCase();

  if (
    status !== "open" &&
    status !== "active"
  ) {
    throw new Error(
      "Accounting period is not open"
    );
  }

  return data;
}
