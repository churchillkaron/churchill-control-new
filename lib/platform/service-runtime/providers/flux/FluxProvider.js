import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";


export const FluxProvider = {

  id: "flux",

  async execute(input = {}) {

    const credential =
      input.credential_id
        ? await CredentialRuntime.resolve(
            input.credential_id
          )
        : null;

    const apiKey =
      credential?.secret_reference ||
      process.env.FLUX_API_KEY;


    const {
      prompt,
      assets,
      poster,
    } = input;


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

Ultra realistic luxury hospitality photography.

Premium cinematic commercial image enhancement.

Preserve original identity.

Preserve original composition.

Maintain natural skin texture.

Professional DSLR photography.

Luxury lighting.

High-end commercial quality.

${poster?.venue || ""}

${poster?.campaignType || ""}

${poster?.mood || ""}

${poster?.atmosphere || ""}

${poster?.extraDirection || ""}

${prompt || ""}

`;


    const response =
      await fetch(
        process.env.FLUX_API_URL,
        {

          method:"POST",

          headers:{

            Authorization:
              `Key ${apiKey}`,

            "Content-Type":
              "application/json",

          },

          body:JSON.stringify({

            prompt:
              enhancementPrompt,

            image_urls:[
              sourceImageUrl,
            ],

            strength:
              0.72,

            guidance_scale:
              8,

            num_inference_steps:
              40,

            safety_tolerance:
              2,

            output_format:
              "jpeg",

            enable_safety_checker:
              false,

            sync_mode:
              true,

            aspect_ratio:
              "4:5",

          }),

        }
      );


    const result =
      await response.json();


    const imageUrl =
      result?.images?.[0]?.url ||
      result?.image?.url ||
      result?.url ||
      null;


    if (!imageUrl) {

      throw new Error(
        "Flux generation failed"
      );

    }


    return {

      success:true,

      provider:
        "flux",

      model:
        "flux",

      output:{

        image_url:
          imageUrl,

        source_image_url:
          sourceImageUrl,

      },

    };

  },

};
