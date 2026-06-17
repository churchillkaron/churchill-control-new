import { createServerSupabase } from "@/lib/shared/supabase/server";

export async function saveCreativeAsset(payload) {
  const supabase = createServerSupabase();

  const {
    data,
    error,
  } = await supabase
    .from("creative_assets")
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
