export const AVANTIQO_SUPABASE_URL = "https://vfsjqabpkcbiuerhzugk.supabase.co";
export const AVANTIQO_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_h6hxUcF6-ANyxxCGQuPfhQ_cY78qBWK";

export function getPublicSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || AVANTIQO_SUPABASE_URL;
}

export function getPublicSupabaseKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    AVANTIQO_SUPABASE_PUBLISHABLE_KEY
  );
}
