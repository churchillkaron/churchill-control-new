import postJournalToLedger from "@/lib/finance/general-ledger/postJournalToLedger";

/**
 * INTERNAL JOURNAL ENGINE ONLY
 * DO NOT CALL DIRECTLY FROM BUSINESS LAYER
 */

export async function createJournalEntry(entry, context = {}) {
  const journal = {
    ...entry,
    entity_id: context.entity_id || null
  };

  return await postJournalToLedger(journal);
}
