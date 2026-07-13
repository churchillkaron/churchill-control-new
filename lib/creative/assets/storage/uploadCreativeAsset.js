import { getServiceSupabase } from "@/lib/shared/supabase/service";


const supabaseAdmin =
  getServiceSupabase();


export async function uploadCreativeAsset({

  file,

  organizationId,

}) {


  if (!organizationId) {

    throw new Error(
      "organizationId required"
    );

  }


  const path =
    `${organizationId}/${Date.now()}.png`;


  const {
    error
  } =
    await supabaseAdmin.storage
      .from("creative-assets")
      .upload(
        path,
        file,
        {
          contentType:
            "image/png",

          upsert:true,
        }
      );


  if(error) {

    throw error;

  }


  const {
    data
  } =
    supabaseAdmin.storage
      .from("creative-assets")
      .getPublicUrl(path);


  return data.publicUrl;

}
