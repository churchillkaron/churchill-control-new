export const dynamic = "force-dynamic";

import OpenAI
from "openai";

export async function POST(req) {
const openai =
  new OpenAI({

    apiKey:
      process.env.OPENAI_API_KEY,

  });


  try {

    const {
      prompt,
    } = await req.json();

    const result =
      await openai.images.generate({

        model:
          "gpt-image-1",

        prompt,

        size:
          "1536x1024",

      });

    const imageBase64 =
      result.data?.[0]?.b64_json;

    if (!imageBase64) {

      throw new Error(
        "No image generated"
      );

    }

    const imageUrl = `

data:image/png;base64,${imageBase64}

`;

    return Response.json({

      success: true,

      imageUrl,

    });

  } catch (error) {

    console.error(
      "IMAGE GENERATION ERROR:",
      error
    );

    return Response.json(

      {

        success: false,

        error:
          error.message,

      },

      {

        status: 500,

      }

    );

  }

}