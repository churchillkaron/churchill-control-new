export async function runSDXLCompositeEngine({

  prompt,

  assets,

}) {

  console.log(
    "RUNNING SDXL COMPOSITE ENGINE"
  );

  // FUTURE:
  // CONTROLNET
  // STAFF + VENUE COMPOSITE
  // AI SCENE BUILDING

  const compositeImageUrl =
    null;

  return {

    success: true,

    provider:
      "sdxl",

    output: {

      image_url:
        compositeImageUrl,

      assets,

      prompt,

      metadata: {

        model:
          "sdxl-controlnet",

      },

    },

  };

}