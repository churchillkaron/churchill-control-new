import { buildFluxEnhancePrompt }
from "@/lib/marketing/ai/engines/buildFluxEnhancePrompt";

export async function runFluxEnhanceEngine({

  prompt,

  assets,

  poster,

}) {

  try {

    console.log(
      "RUNNING FLUX ENHANCE ENGINE"
    );

    const sourceAsset =

      assets?.selectedAssets?.[0] ||

      assets?.[0] ||

      null;

    if (!sourceAsset) {

      throw new Error(
        "No source asset provided"
      );

    }

    const sourceImageUrl =

      sourceAsset.file_url ||

      sourceAsset.image_url ||

      sourceAsset.url ||

      null;

    if (!sourceImageUrl) {

      throw new Error(
        "No source image URL found"
      );

    }

    const enhancementPrompt = `

Ultra realistic luxury nightlife photography.

Premium hospitality campaign photography.

Beautiful female singer.

Natural luxury beauty.

Smooth refined healthy skin texture.

Soft cinematic skin retouching.

Elegant facial symmetry.

Luxury beauty photography.

Detailed eyes and eyelashes.

Natural lips and facial texture.

Preserve natural pores.

No rough skin.

No acne texture.

No oversharpening.

No gritty texture.

No AI artifacts.

No distorted anatomy.

No plastic skin.

No cartoon look.

Professional full-frame DSLR photography.

85mm portrait lens.

Soft depth of field.

Warm cinematic lighting.

Golden luxury tones.

High-end nightlife atmosphere.

Rich contrast.

Luxury hospitality campaign aesthetic.

Magazine-quality beauty retouching.

Maintain original identity.

Maintain original pose.

Maintain original composition.

Maintain original hairstyle.

Maintain original facial structure.

${buildFluxEnhancePrompt({

  venue:
    poster?.venue,

  mood:
    poster?.mood,

  atmosphere:
    poster?.atmosphere,

  campaignType:
    poster?.campaignType,

  assetAnalysis:
    sourceAsset?.analysis,

  extraDirection:
    poster?.extraDirection,

  basePrompt:
    prompt,

})}

`;

    console.log(
      "FLUX ENHANCEMENT PROMPT:",
      enhancementPrompt
    );

    const response =
      await fetch(

        process.env.FLUX_API_URL,

        {

          method: "POST",

          headers: {

            Authorization:
              `Key ${process.env.FLUX_API_KEY}`,

            "Content-Type":
              "application/json",

          },

         body: JSON.stringify({

  prompt:
    enhancementPrompt,

  image_urls: [
    sourceImageUrl,
  ],

  strength: 0.72,

  guidance_scale: 8,

  num_inference_steps: 40,

  safety_tolerance: 2,

  output_format: "jpeg",

  enable_safety_checker: false,

  sync_mode: true,

  aspect_ratio: "4:5",

  seed: Math.floor(
    Math.random() * 9999999
  ),

}),

        }

      );

    const result =
      await response.json();

    console.log(
      "FAL FLUX RESULT:",
      result
    );

    const enhancedImageUrl =

      result?.images?.[0]?.url ||

      result?.image?.url ||

      result?.url ||

      null;

    if (!enhancedImageUrl) {

      throw new Error(
        "Flux enhancement failed"
      );

    }

    return {

      success: true,

      provider:
        "fal",

      model:
        "flux-2-pro-edit",

      output: {

        image_url:
          enhancedImageUrl,

        source_image_url:
          sourceImageUrl,

        prompt:
          enhancementPrompt,

        assets,

        metadata: {

          provider:
            "fal",

          model:
            "flux-2-pro-edit",

          mode:
            "image-enhancement",

        },

      },

    };

  } catch (err) {

    console.error(
      "FLUX ENHANCE ENGINE ERROR:",
      err
    );

    return {

      success: false,

      provider:
        "fal",

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