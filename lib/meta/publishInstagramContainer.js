export async function publishInstagramContainer({
  instagramBusinessId,
  accessToken,
  containerId,
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

    if (!containerId) {

      return {
        success: false,
        platform: "instagram",
        error: "Missing containerId",
      };

    }

    const response = await fetch(
      `https://graph.facebook.com/v23.0/${instagramBusinessId}/media_publish`,
      {
        method: "POST",
        body: new URLSearchParams({
          creation_id: containerId,
          access_token: accessToken,
        }),
      }
    );

    const data = await response.json();

    console.log(
      "INSTAGRAM PUBLISH RESPONSE:",
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
        error: "No Instagram post ID returned",
        details: data,
      };

    }

    return {
      success: true,
      platform: "instagram",
      postId: data.id,
      response: data,
    };

  } catch (error) {

    console.error(
      "INSTAGRAM PUBLISH ERROR:",
      error
    );

    return {
      success: false,
      platform: "instagram",
      error: error.message,
    };

  }

}