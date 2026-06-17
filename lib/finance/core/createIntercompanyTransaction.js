import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function createIntercompanyTransaction({
  tenantId,
  sourceEntity,
  targetEntity,
  transactionType,
  referenceNumber,
  amount,
}) {
  const { data, error } =
    await supabase
      .from(
        "intercompany_transactions"
      )
      .insert({
        tenant_id: tenantId,
        source_entity:
          sourceEntity,
        target_entity:
          targetEntity,
        transaction_type:
          transactionType,
        reference_number:
          referenceNumber,
        amount,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
