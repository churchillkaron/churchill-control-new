import { supabase }
from "@/lib/supabase";

export async function uploadGeneratedImage({

  base64,

  tenantId,

}) {

  const fileName =

    `${tenantId}/generated-${Date.now()}.png`;

  const buffer =
    Buffer.from(
      base64,
      "base64"
    );

  const { error } =
    await supabase.storage
      .from(
        "marketing-assets"
      )
      .upload(

        fileName,

        buffer,

        {
          contentType:
            "image/png",
        }

      );

  if (error) {

    console.error(
      "UPLOAD GENERATED IMAGE ERROR:",
      error
    );

    throw error;

  }

  const { data } =
    supabase.storage
      .from(
        "marketing-assets"
      )
      .getPublicUrl(
        fileName
      );

  return data.publicUrl;

}