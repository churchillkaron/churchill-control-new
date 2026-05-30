import { supabase } from "@/lib/supabase";

export async function assignDimensionToJournalLine({
  tenantId,
  journalLineId,
  dimensionId,
}) {
  const { data, error } = await supabase
    .from("journal_line_dimensions")
    .insert({
      tenant_id: tenantId,
      journal_line_id: journalLineId,
      dimension_id: dimensionId,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
