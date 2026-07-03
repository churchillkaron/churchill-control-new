import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createOrganization(data) {
  const { data: org, error } = await supabaseAdmin
    .from("organizations")
    .insert(data)
    .select()
    .single();

  if (error) throw error;

  return org;
}
