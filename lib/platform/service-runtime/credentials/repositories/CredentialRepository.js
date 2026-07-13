import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


const TABLE =
  "provider_credentials";


export async function save(record) {

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(TABLE)
      .upsert(record)
      .select()
      .single();


  if (error) {

    throw error;

  }


  return data;

}



export async function get(id) {

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq(
        "id",
        id
      )
      .single();


  if (error) {

    throw error;

  }


  return data;

}
