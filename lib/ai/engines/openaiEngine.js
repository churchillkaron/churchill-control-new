import OpenAI
from "openai";

import { uploadGeneratedImage }
from "@/lib/supabase/uploadGeneratedImage";

const openai =
  new OpenAI({
    apiKey:
      process.env.OPENAI_API_KEY,
  });

export async function runOpenAIEngine({

  prompt,

  tenantId,

}) {

  console.log(
    "RUNNING OPENAI ENGINE"
  );

  const result =
    await openai.images.generate({

      model:
        "gpt-image-1",

     prompt: `

${prompt}

Use the provided hospitality assets as visual inspiration.

Maintain:
- cinematic luxury
- nightlife realism
- premium hospitality branding
- realistic lighting
- venue consistency

`,

      size:
        "1024x1024",

    });

  const imageBase64 =
    result.data?.[0]?.b64_json;

  if (!imageBase64) {

    throw new Error(
      "OpenAI image generation failed"
    );

  }

  const uploadedImageUrl =
    await uploadGeneratedImage({

      base64:
        imageBase64,

      tenantId,

    });

  return {

    success: true,

    provider:
      "openai",

    output: {

      image_url:
        uploadedImageUrl,

      prompt,

      metadata: {

        model:
          "gpt-image-1",

        size:
          "1024x1024",

      },

    },

  };

}