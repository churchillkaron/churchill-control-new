import OpenAI
from "openai";

export async function extractFaceIdentity({

  imageUrl,

}) {

  const openai =
    new OpenAI({

      apiKey:
        process.env.OPENAI_API_KEY,

    });

  const completion =
    await openai.chat.completions.create({

      model:
        "gpt-4.1-mini",

      messages: [

        {
          role: "system",

          content:
            `
Analyze this person for commercial marketing use.

Return JSON only.

Detect:

- gender
- approximate_age
- hairstyle
- hair_color
- facial_features
- vibe
- fashion_style
- business_role
- industry_relevance_score
- brand_alignment_score

- hospitality_role
- luxury_score
- nightlife_score

- reusable_identity_prompt
            `,
        },

        {
          role: "user",

          content: [

            {
              type: "text",

              text:
                "Analyze this person.",
            },

            {
              type: "image_url",

              image_url: {

                url:
                  imageUrl,

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

  const result = JSON.parse(

    completion.choices?.[0]
      ?.message?.content || "{}"

  );

  return {

    ...result,

    business_role:
      result.business_role ||
      result.hospitality_role ||
      null,

    industry_relevance_score:
      result.industry_relevance_score ??
      result.nightlife_score ??
      0,

    brand_alignment_score:
      result.brand_alignment_score ??
      result.luxury_score ??
      0,

  };

}