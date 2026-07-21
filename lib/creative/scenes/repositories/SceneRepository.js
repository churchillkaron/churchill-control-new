import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_scenes";

export async function list({
  organization_id,
  creative_project_id,
}) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organization_id)