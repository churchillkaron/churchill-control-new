import { supabase } from "@/lib/supabase";

export async function createDimension(data) {
  const { data: dimension, error } = await supabase
    .from("accounting_dimensions")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return dimension;
}
