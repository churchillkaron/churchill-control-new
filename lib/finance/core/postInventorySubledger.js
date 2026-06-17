import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function postInventorySubledger(data) {
  const { data: result, error } = await supabase
    .from("inventory_subledger")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return result;
}
