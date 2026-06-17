import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runConsolidation({
  tenantIds,
}) {
  const summaries = [];

  for (const tenantId of tenantIds) {
    const { data: journals } = await supabase
      .from("journal_entry_lines")
      .select("debit, credit")
      .eq("tenant_id", tenantId);

    let debit = 0;
    let credit = 0;

    for (const line of journals || []) {
      debit += Number(line.debit || 0);
      credit += Number(line.credit || 0);
    }

    summaries.push({
      tenantId,
      totalDebit: debit,
      totalCredit: credit,
    });
  }

  return summaries;
}
