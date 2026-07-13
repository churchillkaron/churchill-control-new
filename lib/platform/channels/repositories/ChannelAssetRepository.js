import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


const TABLE =
  "organization_channel_assets";


export async function save(record){

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
            "channel_provider,external_id",
        }
      )
      .select()
      .single();


  if(error){
    throw error;
  }


  return data;

}



export async function find({

  organization_id,

  channel_provider,

  asset_type,

  external_id,

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
        "channel_provider",
        channel_provider
      )
      .eq(
        "asset_type",
        asset_type
      )
      .eq(
        "external_id",
        external_id
      )
      .maybeSingle();


  if(error){
    throw error;
  }


  return data;

}


export async function listByConnection({

  organization_id,

  connection_id,

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
        "connection_id",
        connection_id
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

