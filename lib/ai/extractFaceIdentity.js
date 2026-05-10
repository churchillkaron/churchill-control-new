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
Analyze this hospitality staff member.

Return JSON only.

Detect:

- gender
- approximate_age
- hairstyle
- hair_color
- facial_features
- vibe
- fashion_style
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
                "Analyze this hospitality person.",
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

  return JSON.parse(

    completion.choices?.[0]
      ?.message?.content || "{}"

  );

}