import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


const TABLE =
  "organization_channel_connections";


export async function listByOrganization(
  organization_id
){

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


  if(error){
    throw error;
  }


  return data || [];

}



export async function getByOrganizationChannel({

  organization_id,

  provider,

}){


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
        "provider",
        provider
      )
      .maybeSingle();


  if(error){
    throw error;
  }


  return data;

}



export async function save(record){

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(TABLE)
      .upsert(
        {
          ...record,
          updated_at:
            new Date()
            .toISOString(),
        }
      )
      .select()
      .single();


  if(error){
    throw error;
  }


  return data;

}
