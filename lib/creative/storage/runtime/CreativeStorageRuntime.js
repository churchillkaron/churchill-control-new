import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const BUCKET = "creative-assets";

export const CreativeStorageRuntime = {

  async uploadFromUrl({
    organization_id,
    creative_project_id,
    asset_id,
    url,
    filename,
  }) {

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Unable to download provider asset."
      );
    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    const path = [
      organization_id,
      creative_project_id,
      asset_id,
      filename,
    ].join("/");

    const { error } =
      await supabaseAdmin
        .storage
        .from(BUCKET)
        .upload(
          path,
          buffer,
          {
            upsert: true,
            contentType:
              response.headers.get(
                "content-type"
              ) || "application/octet-stream",
          }
        );

    if (error) {
      throw error;
    }

    const {
      data,
    } =
      supabaseAdmin
        .storage
        .from(BUCKET)
        .getPublicUrl(path);

    return {

      storage_path:
        path,

      public_url:
        data.publicUrl,

    };

  },

};
