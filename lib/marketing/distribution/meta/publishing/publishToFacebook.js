import {
  ProviderEventRuntime,
} from "@/lib/platform/service-runtime/events/runtime/ProviderEventRuntime";


export async function publishToFacebook({
  organization_id,
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

    if (process.env.NODE_ENV !== "production") console.log(
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

    await ProviderEventRuntime.record({

      organization_id:
        arguments[0]?.organization_id,

      provider_id:
        "meta",

      event_type:
        "FACEBOOK_POST_PUBLISHED",

      external_event_id:
        data.id,

      payload:
        data,

    }).catch(() => null);


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