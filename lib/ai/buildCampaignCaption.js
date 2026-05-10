export default async function buildCampaignCaption({

  venue,

  campaignType,

  mood,

  atmosphere,

  subject,

}) {

  const response =
    await fetch(
      "/api/marketing/build-caption",
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

  return {

    caption:
      data.content,

    hashtags: [],

    cta: "",

    fullContent:
      data.content,

  };

}