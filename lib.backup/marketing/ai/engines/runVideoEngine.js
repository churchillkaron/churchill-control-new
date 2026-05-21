import { uploadGeneratedImage }
from "@/lib/supabase/uploadGeneratedImage";

export async function runVideoEngine({

  prompt,

  poster,

  assets,

}) {

  try {

    console.log(
      "RUNNING VIDEO ENGINE"
    );

    // =====================================
    // SOURCE IMAGE
    // =====================================

    const sourceAsset =

      assets?.selectedAssets?.[0] ||

      assets?.[0] ||

      null;

    const sourceImage =

      sourceAsset?.image_url ||

      sourceAsset?.file_url ||

      null;

    if (!sourceImage) {

      throw new Error(
        "Video engine requires source image"
      );

    }
const safeCampaignType =

  (poster?.campaignType || "")
    .replace(/abba/gi, "retro disco")
    .replace(/taylor swift/gi, "pop concert")
    .replace(/beyonce/gi, "live performance")
    .replace(/elvis/gi, "classic music night");
    // =====================================
    // VIDEO PROMPT
    // =====================================

    const cinematicPrompt = `

Luxury cinematic hospitality video.

Ultra realistic motion.

Smooth cinematic camera movement.

Natural human motion.

Premium nightlife atmosphere.

Luxury lighting.

Cinematic depth.

Professional hospitality reel.

No distorted faces.

No fake AI motion.

No flickering.

No broken anatomy.

Business:
${poster?.venue || ""}

Campaign:
${safeCampaignType}

Mood:
${poster?.mood || ""}

Atmosphere:
${poster?.atmosphere || ""}

Direction:
${poster?.extraDirection || ""}

${prompt || ""}

`;

    console.log(
      "VIDEO PROMPT:",
      cinematicPrompt
    );

    // =====================================
// RUNWAY API
// =====================================

const response =
  await fetch(

    "https://api.dev.runwayml.com/v1/image_to_video",

    {

      method: "POST",

      headers: {

        Authorization:
          `Bearer ${process.env.RUNWAY_API_KEY}`,

        "Content-Type":
          "application/json",

        "X-Runway-Version":
          "2024-11-06",

      },

      body: JSON.stringify({

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

  console.log(
  "RUNWAY STATUS:",
  response.status
);

console.log(
  "RUNWAY RESULT:",
  JSON.stringify(
    result,
    null,
    2
  )
);

console.log(
  "RUNWAY RAW RESPONSE:",
  result
);

  

    

    // =====================================
    // RETURN JOB
    // =====================================

   return {

  success: true,

  provider:
    "runway",

  model:
    "gen4_turbo",

  output: {

    video_job_id:
      result.id,

    status:
      "processing",

    prompt,

  },



    };

  } catch (err) {

    console.error(
      "VIDEO ENGINE ERROR:",
      err
    );

    return {

      success: false,

      engine:
        "video",

      provider:
        "runway",

      error:
        err.message,

      output: {

        video_url:
          null,

        error:
          err.message,

      },

    };

  }

}