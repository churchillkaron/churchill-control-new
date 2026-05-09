import { createInstagramMediaContainer }
from "@/lib/meta/createInstagramMediaContainer";

import { publishInstagramContainer }
from "@/lib/meta/publishInstagramContainer";

export async function publishToInstagram({
  instagramBusinessId,
  accessToken,
  imageUrl,
  caption,
}) {

  try {

    // STEP 1
    // CREATE MEDIA CONTAINER

    const containerResult =
      await createInstagramMediaContainer({
        instagramBusinessId,
        accessToken,
        imageUrl,
        caption,
      });

    console.log(
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
      await publishInstagramContainer({
        instagramBusinessId,
        accessToken,
        containerId:
          containerResult.containerId,
      });

    console.log(
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