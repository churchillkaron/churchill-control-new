import { supabase } from "@/lib/supabase";

export async function runEliminations({
  tenantId,
}) {
  const entries = [
    {
      tenant_id: tenantId,
      elimination_type: "intercompany_sales",
      source_entity: "Churchill",
      target_entity: "Beach Club",
      amount: 280000,
    },
    {
      tenant_id: tenantId,
      elimination_type: "management_fee",
      source_entity: "Holding",
      target_entity: "Restaurant",
      amount: 120000,
    },
  ];

  const { data, error } = await supabase
    .from("elimination_entries")
    .insert(entries)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
