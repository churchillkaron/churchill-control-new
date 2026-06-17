import { createServerSupabase } from "@/lib/shared/supabase/server";

export async function updateCreativeAsset({
  id,
  updates,
}) {
  const supabase = createServerSupabase();

  const {
    data,
    error,
  } = await supabase
    .from("creative_assets")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
