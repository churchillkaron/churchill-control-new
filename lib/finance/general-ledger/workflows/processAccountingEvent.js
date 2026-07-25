import { postJournalEntrySafe } from "@/lib/finance/general-ledger/capabilities/postJournalEntrySafe";
import { prepareAccountingEventJournal } from "./prepareAccountingEventJournal";

export async function processAccountingEvent({
  event,
}) {
  const prepared =
    await prepareAccountingEventJournal({
      event,
    });

  return postJournalEntrySafe(prepared);
}
