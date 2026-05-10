export async function publishCampaignNow({

  campaignId,

}) {

  try {

    const response =
      await fetch(

        "/api/marketing/publish",

        {

          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

          },

          body: JSON.stringify({

            campaignId,

          }),

        }

      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(

        data?.error ||
        "Publish failed"

      );

    }

    return {

      success: true,

      data,

    };

  } catch (err) {

    console.error(
      "PUBLISH CAMPAIGN ERROR:",
      err
    );

    return {

      success: false,

      error:
        err.message,

    };

  }

}