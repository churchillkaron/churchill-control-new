export default async function buildCampaignCaption({

  venue,

  campaignType,

  mood,

  atmosphere,

  subject,

}) {

  try {

    const response =
      await fetch(

        "http://localhost:3000/api/marketing/build-caption",

        {

          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

          },

          body: JSON.stringify({

            venue,

            campaignType,

            mood,

            atmosphere,

            subject,

          }),

        }

      );

    const data =
      await response.json();

    console.log(
      "CAPTION RESPONSE:",
      data
    );

    return {

      caption:
        data?.caption || "",

      hashtags:
        data?.hashtags || [],

      fullContent:
        data?.fullContent || "",

    };

  } catch (err) {

    console.error(
      "BUILD CAMPAIGN CAPTION ERROR:",
      err
    );

    return {

      caption: "",

      hashtags: [],

      fullContent: "",

    };

  }

}