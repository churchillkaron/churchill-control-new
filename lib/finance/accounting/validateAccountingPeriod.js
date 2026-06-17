import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

// =====================================
// VALIDATE ACCOUNTING PERIOD
// =====================================

export async function validateAccountingPeriod({

  tenantId,

  entryDate,

}) {

  const {
    data: periods,
    error,
  } = await supabaseAdmin

    .from("accounting_periods")
    .select("*")
    .eq("tenant_id", tenantId)

    .lte(
      "start_date",
      entryDate
    )

    .gte(
      "end_date",
      entryDate
    );

  if (error) {

    throw error;

  }

  if (
    !periods ||
    periods.length === 0
  ) {

    throw new Error(
      "No accounting period found"
    );

  }

  const blockedStatuses = [
    "closed",
    "locked",
  ];

  const blocked =
    periods.find((p) =>
      blockedStatuses.includes(
        p.status
      )
    );

  if (blocked) {

    throw new Error(

      `Accounting period is ${blocked.status}`

    );

  }

  return true;

}