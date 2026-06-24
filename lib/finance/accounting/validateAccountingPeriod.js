import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function validateAccountingPeriod({
  tenantId,
  organizationId,
  entryDate,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data: periods, error } =
    await supabaseAdmin
      .from("accounting_periods")
      .select("*")
      .eq("organization_id", organizationId)
      .lte("start_date", entryDate)
      .gte("end_date", entryDate);

  if (error) {
    throw error;
  }

  if (!periods || periods.length === 0) {
    throw new Error("No accounting period found");
  }

  const blocked =
    periods.find((p) =>
      ["closed", "locked"].includes(
        String(p.status || "").toLowerCase()
      )
    );

  if (blocked) {
    throw new Error(
      `Accounting period is ${blocked.status}`
    );
  }

  return true;
}
