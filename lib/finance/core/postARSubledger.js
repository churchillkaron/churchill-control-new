import { supabase } from "@/lib/supabase";

export async function postARSubledger(data) {
  const { data: result, error } = await supabase
    .from("ar_subledger")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return result;
}
