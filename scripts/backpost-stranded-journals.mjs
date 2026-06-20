import postJournalToLedger from "../lib/finance/general-ledger/postJournalToLedger.js";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";

const { data: journals, error } = await supabaseAdmin
  .from("journal_entries")
  .select("id, tenant_id, entry_number, description")
  .not("id", "in", `(${
    "select distinct journal_entry_id from general_ledger"
  })`);

if (error) {
  console.error(error);
  process.exit(1);
}

let posted = 0;

for (const journal of journals || []) {
  await postJournalToLedger({
    journalEntryId: journal.id,
    tenantId: journal.tenant_id,
    createdBy: "system",
  });

  posted += 1;
  console.log("POSTED", journal.entry_number, journal.description);
}

console.log("BACKPOST COMPLETE", posted);
