import { supabaseAdmin } from "@/lib/shared/supabase/admin";


export async function updateFixedAsset({
  organization_id,
  id,
  values,
}) {

  const { data, error } =
    await supabaseAdmin
      .from("fixed_assets")
      .update(values)
      .eq(
        "organization_id",
        organization_id
      )
      .eq(
        "id",
        id
      )
      .select()
      .single();

  if(error) throw error;

  return data;
}


export async function archiveFixedAsset({
  organization_id,
  id,
}) {

  const { error } =
    await supabaseAdmin
      .from("fixed_assets")
      .update({
        status:"ARCHIVED",
      })
      .eq(
        "organization_id",
        organization_id
      )
      .eq(
        "id",
        id
      );

  if(error) throw error;

  return true;
}
