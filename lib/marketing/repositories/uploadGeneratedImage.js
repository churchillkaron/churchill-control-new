import sharp from "sharp";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

const supabase =
  createServerSupabase();

export async function uploadGeneratedImage({

  organizationId,

  imageBase64,

}) {

  if (!organizationId) {
    throw new Error(
      "organizationId required"
    );
  }

  if (!imageBase64) {
    throw new Error(
      "No base64 image provided"
    );
  }

  const base64Data =
    imageBase64.replace(
      /^data:image\/\w+;base64,/,
      ""
    );

  const buffer =
    Buffer.from(
      base64Data,
      "base64"
    );

  const thumbnailBuffer =
    await sharp(buffer)
      .resize({
        width: 400,
        fit: "inside",
      })
      .png()
      .toBuffer();

  const fileName =
    `${Date.now()}.png`;

  const fullPath =
    `${organizationId}/full/${fileName}`;

  const thumbPath =
    `${organizationId}/thumbs/${fileName}`;

  const { error: fullError } =
    await supabase.storage
      .from("marketing-assets")
      .upload(
        fullPath,
        buffer,
        {
          contentType: "image/png",
          upsert: true,
        }
      );

  if (fullError) {
    throw fullError;
  }

  const { error: thumbError } =
    await supabase.storage
      .from("marketing-assets")
      .upload(
        thumbPath,
        thumbnailBuffer,
        {
          contentType: "image/png",
          upsert: true,
        }
      );

  if (thumbError) {
    throw thumbError;
  }

  const { data: fullPublic } =
    supabase.storage
      .from("marketing-assets")
      .getPublicUrl(fullPath);

  const { data: thumbPublic } =
    supabase.storage
      .from("marketing-assets")
      .getPublicUrl(thumbPath);

  return {

    success: true,

    url:
      fullPublic.publicUrl,

    thumbnail_url:
      thumbPublic.publicUrl,

    filePath:
      fullPath,

    thumbnailPath:
      thumbPath,

  };

}
