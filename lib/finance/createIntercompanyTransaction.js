import { supabase } from "@/lib/supabase";

export async function createIntercompanyTransaction(data) {
  const { data: tx, error } = await supabase
    .from("intercompany_transactions")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return tx;
}
