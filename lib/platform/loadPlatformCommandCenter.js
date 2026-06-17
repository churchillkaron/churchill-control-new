import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getPlatformModules() {
  const { data, error } = await supabaseAdmin
    .from("platform_modules")
    .select("*")
    .eq("status", "ACTIVE");

  if (error) {
    console.error("platform_modules error:", error.message);
    return [];
  }

  return data || [];
}
