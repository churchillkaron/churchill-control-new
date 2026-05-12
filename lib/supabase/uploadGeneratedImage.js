import sharp from "sharp";

import { supabase }
from "@/lib/supabase";

export async function uploadGeneratedImage({

  tenantId,

  imageBase64,

}) {

  try {

    if (!imageBase64) {

      throw new Error(
        "No base64 image provided"
      );

    }

    // =====================================
    // REMOVE PREFIX
    // =====================================

    const base64Data =
      imageBase64.replace(

        /^data:image\/\w+;base64,/,

        ""

      );

    // =====================================
    // BUFFER
    // =====================================

    const buffer =
      Buffer.from(

        base64Data,

        "base64"

      );

    // =====================================
    // THUMBNAIL
    // =====================================

    const thumbnailBuffer =
      await sharp(buffer)

        .resize({

          width: 400,

          fit: "inside",

        })

        .png()

        .toBuffer();

    // =====================================
    // FILE PATHS
    // =====================================

    const fileName =
      `${Date.now()}.png`;

    const fullPath =

      `${tenantId}/full/${fileName}`;

    const thumbPath =

      `${tenantId}/thumbs/${fileName}`;

    // =====================================
    // UPLOAD FULL IMAGE
    // =====================================

    const {

      error: fullError,

    } = await supabase.storage

      .from(
        "marketing-assets"
      )

      .upload(

        fullPath,

        buffer,

        {

          contentType:
            "image/png",

          upsert: true,

        }

      );

    if (fullError) {

      console.error(
        "FULL IMAGE UPLOAD ERROR:",
        fullError
      );

      throw fullError;

    }

    // =====================================
    // UPLOAD THUMBNAIL
    // =====================================

    const {

      error: thumbError,

    } = await supabase.storage

      .from(
        "marketing-assets"
      )

      .upload(

        thumbPath,

        thumbnailBuffer,

        {

          contentType:
            "image/png",

          upsert: true,

        }

      );

    if (thumbError) {

      console.error(
        "THUMBNAIL UPLOAD ERROR:",
        thumbError
      );

      throw thumbError;

    }

    // =====================================
    // PUBLIC URLS
    // =====================================

    const {

      data: fullPublic,

    } = supabase.storage

      .from(
        "marketing-assets"
      )

      .getPublicUrl(
        fullPath
      );

    const {

      data: thumbPublic,

    } = supabase.storage

      .from(
        "marketing-assets"
      )

      .getPublicUrl(
        thumbPath
      );

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

  } catch (err) {

    console.error(
      "UPLOAD GENERATED IMAGE FAILED:",
      err
    );

    return {

      success: false,

      error:
        err.message,

    };

  }

}