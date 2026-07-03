import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getSession(token) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error) return null;

  return data?.user || null;
}
