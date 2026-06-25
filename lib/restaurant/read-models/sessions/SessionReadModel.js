import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function refreshSessionReadModel({
  organizationId,
  sessionId,
}) {

  const { data, error } =
    await supabaseAdmin
      .from("table_sessions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", sessionId)
      .single();

  if (error) throw error;

  return data;
}
