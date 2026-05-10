import OpenAI
from "openai";

const openai =
  new OpenAI({

    apiKey:
      process.env
        .NEXT_PUBLIC_OPENAI_API_KEY,

  });

export async function runOpenAIGeneration({

  prompt,

}) {

  try {

    const response =
      await openai.images.generate({

        model: "gpt-image-1",

        prompt,

        size: "1536x1024",

      });

    const imageUrl =
      response.data?.[0]?.url;

    if (!imageUrl) {

      throw new Error(
        "No image returned"
      );

    }

    return {

      success: true,

      imageUrl,

      provider:
        "openai",

    };

  } catch (err) {

    console.error(
      "OPENAI GENERATION ERROR:",
      err
    );

    throw err;

  }

}