import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";


export const RunwayProvider = {

  id: "runway",

  async execute(input = {}) {

    const credential =
      input.credential_id
        ? await CredentialRuntime.resolve(
            input.credential_id
          )
        : null;

    const apiKey =
      credential?.secret_reference ||
      process.env.RUNWAY_API_KEY;


    const {
      prompt,
      assets,
      poster,
    } = input;


    const sourceAsset =
      assets?.selectedAssets?.[0] ||
      assets?.[0] ||
      null;


    const sourceImage =
      sourceAsset?.image_url ||
      sourceAsset?.file_url ||
      sourceAsset?.url ||
      null;


    if (!sourceImage) {

      throw new Error(
        "Video generation requires source image"
      );

    }


    const cinematicPrompt = `

Luxury cinematic hospitality video.

Ultra realistic motion.

Smooth cinematic camera movement.

Natural human motion.

Premium nightlife atmosphere.

Luxury lighting.

Professional hospitality reel.

No distorted faces.

No fake AI motion.

No flickering.

No broken anatomy.


Business:
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


    const response =
      await fetch(
        "https://api.dev.runwayml.com/v1/image_to_video",
        {

          method:
            "POST",

          headers: {

            Authorization:
              `Bearer ${apiKey}`,

            "Content-Type":
              "application/json",

            "X-Runway-Version":
              "2024-11-06",

          },

          body:
            JSON.stringify({

              model:
                "gen4_turbo",

              promptText:
                cinematicPrompt,

              promptImage:
                sourceImage,

              duration:
                5,

              ratio:
                "1280:720",

            }),

        }
      );


    const result =
      await response.json();


    if (!result?.id) {

      throw new Error(
        "Runway video generation failed"
      );

    }


    return {

      success:
        true,

      provider:
        "runway",

      model:
        "gen4_turbo",

      output: {

        video_job_id:
          result.id,

        status:
          "processing",

      },

    };

  },

};


export async function getRunwayTaskStatus(jobId) {

  if (!jobId) {
    throw new Error(
      "jobId required"
    );
  }

  const response =
    await fetch(
      `https://api.dev.runwayml.com/v1/tasks/${jobId}`,
      {
        method: "GET",
        headers: {
          Authorization:
            `Bearer ${apiKey}`,

          "X-Runway-Version":
            "2024-11-06",
        },
      }
    );

  return await response.json();

}
