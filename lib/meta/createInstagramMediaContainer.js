export async function createInstagramMediaContainer({
  instagramBusinessId,
  accessToken,
  imageUrl,
  caption,
}) {

  try {

    if (!instagramBusinessId) {

      return {
        success: false,
        platform: "instagram",
        error: "Missing instagramBusinessId",
      };

    }

    if (!accessToken) {

      return {
        success: false,
        platform: "instagram",
        error: "Missing access token",
      };

    }

    if (!imageUrl) {

      return {
        success: false,
        platform: "instagram",
        error: "Missing imageUrl",
      };

    }

    const response = await fetch(
      `https://graph.facebook.com/v23.0/${instagramBusinessId}/media`,
      {
        method: "POST",
        body: new URLSearchParams({
          image_url: imageUrl,
          caption: caption || "",
          access_token: accessToken,
        }),
      }
    );

    const data = await response.json();

    console.log(
      "INSTAGRAM CONTAINER RESPONSE:",
      data
    );

    if (data?.error) {

      return {
        success: false,
        platform: "instagram",
        error: data.error.message,
        details: data.error,
      };

    }

    if (!data?.id) {

      return {
        success: false,
        platform: "instagram",
        error: "No container ID returned",
        details: data,
      };

    }

    return {
      success: true,
      platform: "instagram",
      containerId: data.id,
      response: data,
    };

  } catch (error) {

    console.error(
      "INSTAGRAM CONTAINER ERROR:",
      error
    );

    return {
      success: false,
      platform: "instagram",
      error: error.message,
    };

  }

}