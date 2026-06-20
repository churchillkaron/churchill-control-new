import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * CORE LEDGER ENGINE (RESTORED)
 * Controlled access via financeGateway in future
 */

export async function createJournalEntry(entry) {
  const { data, error } = await supabaseAdmin
    .from("journal_entries")
    .insert(entry)
    .select()
    .single();

  if (error) throw error;

  return data;
}
