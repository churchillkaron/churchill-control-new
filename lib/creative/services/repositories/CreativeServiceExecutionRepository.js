import { supabaseAdmin } from "@/lib/shared/supabase/admin";


const TABLE =
  "creative_service_executions";


export async function create(data={}) {

  const {
    data:result,
    error,
  } =
    await supabaseAdmin
      .from(TABLE)
      .insert(data)
      .select()
      .single();


  if(error) throw error;


  return result;

}
