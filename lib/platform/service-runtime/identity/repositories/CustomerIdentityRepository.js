import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


const TABLE =
  "customer_provider_identities";


export async function save(record) {

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(TABLE)
      .upsert(
        record,
        {
          onConflict:
            "organization_id,provider_id,external_id",
        }
      )
      .select()
      .single();


  if (error) {

    throw error;

  }


  return data;

}



export async function find({

  organization_id,

  provider_id,

  external_id,

}) {


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
      .eq(
        "provider_id",
        provider_id
      )
      .eq(
        "external_id",
        external_id
      )
      .maybeSingle();


  if (error) {

    throw error;

  }


  return data;

}
