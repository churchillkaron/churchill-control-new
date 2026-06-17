import OpenAI from "openai";

const openai =
  new OpenAI({

    apiKey:
      process.env.OPENAI_API_KEY,

  });

export async function runFullAIEngine({

  prompt,

  poster,

  assets,

}) {

  try {

    console.log(
      "RUNNING FULL AI ENGINE"
    );

    const sourceAsset =

      assets?.selectedAssets?.[0] ||

      assets?.[0] ||

      null;

    const referenceImage =

      sourceAsset?.image_url ||

      sourceAsset?.file_url ||

      sourceAsset?.url ||

      null;

    const hasReferenceImage =
      !!referenceImage;

    let cinematicPrompt = "";

    // =========================================
    // IDENTITY PRESERVING MODE
    // =========================================

    if (hasReferenceImage) {

      cinematicPrompt = `

IMPORTANT:

Use uploaded person as exact identity reference.

Preserve original identity.

Do not change gender.

Do not change ethnicity.

Do not replace the person.

Do not redesign the face.

Maintain original hairstyle.

Maintain original facial structure.

Maintain original pose.

Maintain original composition.

Enhance realism only.

Cinematic commercial photography.

Beautiful natural skin.

Smooth healthy skin texture.

Soft cinematic facial lighting.

Brand-appropriate commercial atmosphere.

Natural makeup.

Professional DSLR commercial photography.

Professional brand-appropriate tones.

Natural depth of field.

Professional portrait-quality photography.

No text.

No typography.

No logos.

No watermark.

No signage.

No distorted anatomy.

No fake AI appearance.

No deformed hands.

No extra fingers.

No blurry face.

No overprocessed skin.

No plastic skin.

Scene:
${poster?.campaignType || ""}

Venue:
${poster?.venue || ""}

Mood:
${poster?.mood || ""}

Atmosphere:
${poster?.atmosphere || ""}

Direction:
${poster?.extraDirection || ""}

${prompt || ""}

`;

    }

    // =========================================
    // CREATIVE AI MODE
    // =========================================

    else {

      cinematicPrompt = `

Creative commercial marketing campaign.

Ultra realistic cinematic advertising photography.

Professional commercial branding.

Industry-appropriate visual storytelling.

High-end marketing composition.

Professional advertising quality.

Can creatively generate:

- products
- services
- customers
- teams
- facilities
- operations
- experiences
- events
- environments
- commercial activities
- industry-specific assets

Scene should align with:

- business profile
- industry context
- customer motivations
- revenue drivers
- marketing strategy

Maintain realism and business relevance.


Restaurant businesses:
focus on food, guests, interiors, dining.

Nightlife businesses:
focus on energy, DJs, cocktails, lights.

Music businesses:
focus on live performance atmosphere.

Beach clubs:
focus on brand-appropriate lifestyle context.

Cocktail bars:
focus on drinks and premium ambience.

No text.

No typography.

No watermark.

No fake AI appearance.

No distorted anatomy.

No deformed hands.

No blurry faces.

No plastic skin.

Venue:
${poster?.venue || ""}

Campaign:
${poster?.campaignType || ""}

Mood:
${poster?.mood || ""}

Atmosphere:
${poster?.atmosphere || ""}

Direction:
${poster?.extraDirection || ""}

${prompt || ""}

`;

    }

    console.log(
      "FULL AI PROMPT:",
      cinematicPrompt
    );

    let result;

    // =========================================
    // EDIT EXISTING IMAGE
    // =========================================

    if (hasReferenceImage) {

      const imageResponse =
        await fetch(referenceImage);

      const imageArrayBuffer =
        await imageResponse.arrayBuffer();

      const imageBuffer =
        Buffer.from(imageArrayBuffer);

      const imageFile =
        new File(

          [imageBuffer],

          "reference.png",

          {

            type:
              "image/png",

          }

        );

      result =
        await openai.images.edit({

          model:
            "gpt-image-1",

          image:
            imageFile,

          prompt:
            cinematicPrompt,

          size:
            "1536x1024",

          quality:
            "high",

          input_fidelity:
            "high",

        });

    }

    // =========================================
    // FULL CREATIVE GENERATION
    // =========================================

    else {

      result =
        await openai.images.generate({

          model:
            "gpt-image-1",

          prompt:
            cinematicPrompt,

          size:
            "1536x1024",

          quality:
            "high",

        });

    }

    console.log(
      "FULL AI RESULT:",
      result
    );

    console.log(
  "FULL AI RESULT:",
  result
);

// SUPPORT BOTH URL + BASE64

const imageUrl =

  result?.data?.[0]?.url ||

  (

    result?.data?.[0]?.b64_json

      ? `data:image/png;base64,${result.data[0].b64_json}`

      : null

  );

console.log(
  "FULL AI FINAL URL:",
  imageUrl
);

if (!imageUrl) {

  console.log(
    "FULL AI RAW RESULT:",
    result
  );

  throw new Error(
    "No generated image returned"
  );

}

return {

  success: true,

  engine:
    "full-ai",

  provider:
    "openai",

  output: {

    image_url:
      imageUrl,

    prompt:
      cinematicPrompt,

    assets,

    metadata: {

      provider:
        "openai",

      model:
        "gpt-image-1",

      mode:

        hasReferenceImage

          ? "identity-enhancement"

          : "creative-generation",

    },

  },

};
  } catch (err) {

    console.error(
      "FULL AI ENGINE ERROR:",
      err
    );

    return {

      success: false,

      engine:
        "full-ai",

      provider:
        "openai",

      error:
        err.message,

      output: {

        image_url:
          null,

        error:
          err.message,

      },

    };

  }

}