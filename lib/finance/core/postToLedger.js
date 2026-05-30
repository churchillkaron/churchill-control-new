import { supabase } from "@/lib/supabase";

export async function postToLedger({
  tenantId,
  journal,
  lines,
}) {
  const ledgerRows = lines.map((line) => ({
    tenant_id: tenantId,
    journal_entry_id: journal.id,
    journal_line_id: line.id,
    account_id: line.account_id,
    entry_date: journal.entry_date,
    debit: Number(line.debit || 0),
    credit: Number(line.credit || 0),
    balance:
      Number(line.debit || 0) -
      Number(line.credit || 0),
    department: line.department || null,
    location: line.location || null,
    entity: line.entity || null,
    cost_center: line.cost_center || null,
    dimension_snapshot:
      line.dimensions || [],
  }));

  const { data, error } = await supabase
    .from("general_ledger_entries")
    .insert(ledgerRows)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
