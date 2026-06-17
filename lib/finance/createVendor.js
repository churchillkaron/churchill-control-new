import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function createVendor(data) {
  const { data: vendor, error } = await supabase
    .from("vendors")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return vendor;
}
