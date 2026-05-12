export async function publishToFacebook({
  pageId,
  accessToken,
  imageUrl,
  caption,
}) {

  try {

    if (!pageId) {

      return {
        success: false,
        platform: "facebook",
        error: "Missing pageId",
      };

    }

    if (!accessToken) {

      return {
        success: false,
        platform: "facebook",
        error: "Missing access token",
      };

    }

    if (!imageUrl) {

      return {
        success: false,
        platform: "facebook",
        error: "Missing imageUrl",
      };

    }

    const response = await fetch(
      `https://graph.facebook.com/v23.0/${pageId}/photos`,
      {
        method: "POST",
        body: new URLSearchParams({
          url: imageUrl,
          caption: caption || "",
          access_token: accessToken,
        }),
      }
    );

    const data = await response.json();

    console.log(
      "FACEBOOK PUBLISH RESPONSE:",
      data
    );

    if (data?.error) {

      return {
        success: false,
        platform: "facebook",
        error: data.error.message,
        details: data.error,
      };

    }

    if (!data?.id) {

      return {
        success: false,
        platform: "facebook",
        error: "No Facebook post ID returned",
        details: data,
      };

    }

    return {
      success: true,
      platform: "facebook",
      postId: data.id,
      response: data,
    };

  } catch (error) {

    console.error(
      "FACEBOOK PUBLISH ERROR:",
      error
    );

    return {
      success: false,
      platform: "facebook",
      error: error.message,
    };

  }

}