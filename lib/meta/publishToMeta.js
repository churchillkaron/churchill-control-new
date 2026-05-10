export async function publishToMeta({

  imageUrl,

  caption,

  accessToken,

  pageId,

}) {

  try {

    // STEP 1
    // CREATE PHOTO POST

    const response =
      await fetch(

        `https://graph.facebook.com/v22.0/${pageId}/photos`,

        {

          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

          },

          body: JSON.stringify({

            url:
              imageUrl,

            caption,

            access_token:
              accessToken,

          }),

        }

      );

    const data =
      await response.json();

    if (data.error) {

      throw new Error(
        data.error.message
      );

    }

    return {

      success: true,

      data,

    };

  } catch (err) {

    console.error(
      "META PUBLISH ERROR:",
      err
    );

    return {

      success: false,

      error:
        err.message,

    };

  }

}