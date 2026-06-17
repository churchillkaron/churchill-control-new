import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function postCOGSJournal({
  tenantId,
  referenceType,
  referenceId,
  inventoryValue,
  cogsValue,
}) {
  const { data, error } =
    await supabase
      .from("cogs_journal_entries")
      .insert({
        tenant_id: tenantId,
        reference_type:
          referenceType,
        reference_id:
          referenceId,
        inventory_value:
          inventoryValue,
        cogs_value: cogsValue,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
