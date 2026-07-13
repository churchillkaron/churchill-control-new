import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


const TABLE =
  "provider_events";


export async function create(record) {

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(TABLE)
      .insert(record)
      .select()
      .single();


  if (error) {

    throw error;

  }


  return data;

}



export async function listByOrganization(
  organization_id
) {

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq(
        "organization_id",
        organization_id
      )
      .order(
        "created_at",
        {
          ascending:false,
        }
      );


  if (error) {

    throw error;

  }


  return data || [];

}
