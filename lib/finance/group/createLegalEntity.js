import { supabase } from "@/lib/supabase";

export async function createLegalEntity(data) {
  const { data: entity, error } = await supabase
    .from("legal_entities")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return entity;
}
