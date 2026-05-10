import OpenAI
from "openai";

const openai =
  new OpenAI({
    apiKey:
      process.env.OPENAI_API_KEY,
  });

export async function analyzeMarketingAsset({

  fileUrl,

  assetType,

}) {

  try {

    const completion =
      await openai.chat.completions.create({

        model:
          "gpt-4.1-mini",

        messages: [

          {
            role: "system",

            content:
              `
You analyze hospitality marketing assets.

Return JSON only.

Detect:

- description
- tags
- mood
- lighting
- sceneType
- luxuryScore
- nightlifeScore
- recommendedUsage
- objects
- environment
- people
              `,
          },

          {
            role: "user",

            content: [

              {
                type: "text",

                text:
                  `
Analyze this hospitality marketing asset.

Asset Type:
${assetType}
                  `,
              },

              {
                type: "image_url",

                image_url: {

                  url:
                    fileUrl,

                },

              },

            ],

          },

        ],

        response_format: {
          type:
            "json_object",
        },

      });

    const parsed = JSON.parse(

      completion.choices?.[0]
        ?.message?.content || "{}"

    );

    return {

      description:
        parsed.description ||
        "",

      tags:
        parsed.tags || [],

      mood:
        parsed.mood ||
        "Luxury",

      lighting:
        parsed.lighting ||
        "Cinematic",

      sceneType:
        parsed.sceneType ||
        "Hospitality",

      luxuryScore:
        parsed.luxuryScore || 0,

      nightlifeScore:
        parsed.nightlifeScore || 0,

      recommendedUsage:
        parsed.recommendedUsage || [],

      objects:
        parsed.objects || [],

      environment:
        parsed.environment || "",

      people:
        parsed.people || [],

    };

  } catch (err) {

    console.error(
      "ANALYZE MARKETING ASSET ERROR:",
      err
    );

    throw err;

  }

}