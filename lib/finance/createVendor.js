import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createVendor(data) {
  const { data: vendor, error } = await supabaseAdmin
    .from("vendors")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return vendor;
}
