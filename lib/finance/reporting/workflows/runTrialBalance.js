import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function runTrialBalance({ organizationId }) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data, error } = await supabaseAdmin
    .from("journal_entry_lines")
    .select(`
      debit,
      credit,
      journal_entries!inner(
        organization_id
      )
    `)
    .eq(
      "journal_entries.organization_id",
      organizationId
    );

  if (error) throw error;

  const rows = data || [];

  let debit = 0;
  let credit = 0;

  for (const r of rows) {
    debit += Number(r.debit || 0);
    credit += Number(r.credit || 0);
  }

  return {
    success: true,
    debit,
    credit,
    balanced: debit === credit,
  };
}
