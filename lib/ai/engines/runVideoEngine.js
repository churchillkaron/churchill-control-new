export async function runVideoEngine({

  prompt,

  assets,

}) {

  console.log(
    "RUNNING VIDEO ENGINE"
  );

  // FUTURE:
  // RUNWAY
  // KLING
  // VIDEO RENDERING
  // REELS
  // STORY VIDEOS

  const generatedVideoUrl =
    null;

  return {

    success: true,

    provider:
      "video",

    output: {

      video_url:
        generatedVideoUrl,

      assets,

      prompt,

      metadata: {

        model:
          "runway-gen4",

      },

    },

  };

}