import { supabase } from "@/lib/supabase";

import { validateAccountingPeriod } from "./validateAccountingPeriod";
import { postToLedger } from "./postToLedger";

import { writeImmutableAudit } from "./writeImmutableAudit";


export async function postJournalEntrySafe({
  tenantId,
  entryDate,
  description,
  reference,
  lines,
}) {

  if (!entryDate) {
    throw new Error("Missing entry date");
  }


  await validateAccountingPeriod({
    tenantId,
    entryDate,
  });

  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error(
      "Journal requires minimum two lines"
    );
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    totalDebit += Number(line.debit || 0);
    totalCredit += Number(line.credit || 0);
  }

  if (
    Number(totalDebit.toFixed(2)) !==
    Number(totalCredit.toFixed(2))
  ) {
    throw new Error("Journal is not balanced");
  }

  const { data: journal, error: journalError } =
    await supabase
      .from("journal_entries")
      .insert({
        tenant_id: tenantId,
        entry_date: entryDate,
        description,
        reference,
      posting_source: "system_safe_posting",
        status: "posted",
      })
      .select()
      .single();

  if (journalError) {
    throw journalError;
  }

  const lineRows = lines.map((line) => ({
    journal_entry_id: journal.id,
    tenant_id: tenantId,
    account_id: line.accountId,
    debit: Number(line.debit || 0),
    credit: Number(line.credit || 0),
    memo: line.memo || null,
    department: line.department || null,
    location: line.location || null,
    entity: line.entity || null,
    cost_center: line.costCenter || null,
    dimensions: line.dimensions || [],
    dimensions: line.dimensions || [],
  }));

  const {
    data: insertedLines,
    error: linesError,
  } = await supabase
    .from("journal_entry_lines")
    .insert(lineRows)
    .select();

  if (linesError) {
    throw linesError;
  }

  await postToLedger({
    tenantId,
    journal,
    lines: insertedLines,
  });

  await writeImmutableAudit({
    tenant_id: tenantId,
    entity_type: "journal_entry",
    entity_id: journal.id,
    action_type: "created",
    action_data: {
      description,
      reference,
      posting_source: "system_safe_posting",
      lines: insertedLines,
    },
  });


  return {
    journal,
    lines: insertedLines,
  };
}
