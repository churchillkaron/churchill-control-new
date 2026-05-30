import { supabase } from "@/lib/supabase";

export async function createCostCenter(data) {
  const { data: center, error } = await supabase
    .from("cost_centers")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return center;
}
