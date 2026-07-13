import {
  ProviderEventRuntime,
} from "@/lib/platform/service-runtime/events/runtime/ProviderEventRuntime";

import {
  createInstagramMediaContainer,
  publishInstagramMedia
} from "@/lib/integrations/meta";

export async function publishToInstagram({
  organization_id,
  instagramBusinessId,
  accessToken,
  imageUrl,
  caption,
}) {

  try {

    // STEP 1ƒ
    // CREATE MEDIA CONTAINER

    const containerResult =
      await createInstagramMediaContainer({
        instagramBusinessId,
        accessToken,
        imageUrl,
        caption,
      });

    if (process.env.NODE_ENV !== "production") console.log(
      "INSTAGRAM CONTAINER RESULT:",
      containerResult
    );

    if (!containerResult.success) {

      return {
        success: false,
        platform: "instagram",
        error:
          containerResult.error,
        details:
          containerResult.details,
      };

    }

    // STEP 2
    // PUBLISH CONTAINER

    const publishResult =
      await publishInstagramMedia({
        instagramBusinessId,
        accessToken,
        containerId:
          containerResult.containerId,
      });

    if (process.env.NODE_ENV !== "production") console.log(
      "INSTAGRAM PUBLISH RESULT:",
      publishResult
    );

    if (!publishResult.success) {

      return {
        success: false,
        platform: "instagram",
        error:
          publishResult.error,
        details:
          publishResult.details,
      };

    }

    await ProviderEventRuntime.record({

      organization_id,

      provider_id:
        "meta",

      event_type:
        "INSTAGRAM_POST_PUBLISHED",

      external_event_id:
        publishResult.postId,

      payload:
        publishResult.response,

    }).catch(() => null);


    return {
      success: true,
      platform: "instagram",
      postId:
        publishResult.postId,
      response:
        publishResult.response,
    };

  } catch (error) {

    console.error(
      "PUBLISH TO INSTAGRAM ERROR:",
      error
    );

    return {
      success: false,
      platform: "instagram",
      error: error.message,
    };

  }

}