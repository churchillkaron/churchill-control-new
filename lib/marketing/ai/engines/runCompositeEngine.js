import OpenAI from "openai";

import { buildCompositeLayout }
from "@/lib/marketing/ai/utils/buildCompositeLayout";

const openai =
  new OpenAI({

    apiKey:
      process.env.OPENAI_API_KEY,

  });

export async function runCompositeEngine({

  prompt,

  poster,

  assets,

}) {

  try {

    console.log(
      "RUNNING COMPOSITE ENGINE"
    );

    const selectedAssets =

      assets?.selectedAssets ||

      assets ||

      [];

    if (
      !selectedAssets.length
    ) {

      throw new Error(
        "No assets selected"
      );

    }

    // =====================================
    // LAYOUT PLAN
    // =====================================

    const layoutPlan =

      buildCompositeLayout({

        poster,

        assets:
          selectedAssets,

      });

    console.log(
      "LAYOUT PLAN:",
      layoutPlan
    );

    // =====================================
    // ASSET GROUPING
    // =====================================

    const venueAssets =
      selectedAssets.filter(

        (a) =>

          a.asset_type ===
          "venue"

      );

    const staffAssets =
      selectedAssets.filter(

        (a) =>

          a.asset_type ===
          "staff"

      );

    const cocktailAssets =
      selectedAssets.filter(

        (a) =>

          a.asset_type ===
          "cocktail"

      );

    const foodAssets =
      selectedAssets.filter(

        (a) =>

          a.asset_type ===
          "food"

      );

    // =====================================
    // SELECT PRIMARY ASSETS
    // =====================================

    const venue =
      venueAssets?.[0];

    const performer =
      staffAssets?.[0];

    const cocktail =
      cocktailAssets?.[0];

    const food =
      foodAssets?.[0];

    // =====================================
    // BUILD PROMPT
    // =====================================

    const compositePrompt = `

Luxury hospitality marketing campaign.

Ultra realistic cinematic advertising photography.

Use uploaded assets naturally.

Build one cohesive luxury marketing composition.

Venue should feel premium and cinematic.

Maintain uploaded identity accuracy.

Warm cinematic lighting.

Professional hospitality branding.

Luxury nightlife atmosphere.

Natural skin texture.

Elegant depth of field.

Professional DSLR aesthetic.

====================================

AI LAYOUT PLAN

Orientation:
${layoutPlan.canvas.orientation}

Safe Zone Top:
${layoutPlan.canvas.safeZone.top}

Safe Zone Bottom:
${layoutPlan.canvas.safeZone.bottom}

Safe Zone Left:
${layoutPlan.canvas.safeZone.left}

Safe Zone Right:
${layoutPlan.canvas.safeZone.right}

Background:
${layoutPlan.composition.background}

Primary Subject:
${layoutPlan.composition.subject}

Typography Placement:
${layoutPlan.typography.placement}

Typography Alignment:
${layoutPlan.typography.alignment}

Export Format:
${layoutPlan.export.format}

====================================

Can include:
- cocktails
- luxury food
- performers
- nightlife
- hospitality atmosphere
- cinematic venue interiors

Leave clean safe space for future text overlays.

Do NOT render text into image.

No typography.

No watermark.

No distorted anatomy.

No fake AI appearance.

No deformed hands.

No blurry faces.

No plastic skin.

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

    console.log(
      "COMPOSITE PROMPT:",
      compositePrompt
    );

    // =====================================
    // BUILD IMAGE FILE ARRAY
    // =====================================

    const imageFiles = [];

    for (const asset of selectedAssets) {

      const imageUrl =

        asset?.image_url ||

        asset?.file_url ||

        asset?.url ||

        null;

      if (!imageUrl) {

        continue;

      }

      try {

        const imageResponse =
          await fetch(imageUrl);

        const imageArrayBuffer =
          await imageResponse.arrayBuffer();

        const imageBuffer =
          Buffer.from(imageArrayBuffer);

        const imageFile =
          new File(

            [imageBuffer],

            `${asset.id}.png`,

            {

              type:
                "image/png",

            }

          );

        imageFiles.push(
          imageFile
        );

      } catch (err) {

        console.error(
          "FAILED TO LOAD ASSET:",
          asset,
          err
        );

      }

    }

    if (
      !imageFiles.length
    ) {

      throw new Error(
        "No valid image files"
      );

    }

    // =====================================
    // OPENAI COMPOSITE
    // =====================================

    const result =
      await openai.images.edit({

        model:
          "gpt-image-1",

        image:
          imageFiles,

        prompt:
          compositePrompt,

        size:
          "1536x1024",

        quality:
          "high",

        input_fidelity:
          "high",

      });

    console.log(
      "COMPOSITE RESULT:",
      result
    );

    // =====================================
    // SUPPORT BOTH URL + BASE64
    // =====================================

    const imageUrl =

      result?.data?.[0]?.url ||

      (

        result?.data?.[0]?.b64_json

          ? `data:image/png;base64,${result.data[0].b64_json}`

          : null

      );

    if (!imageUrl) {

      console.log(
        "COMPOSITE RAW RESULT:",
        result
      );

      throw new Error(
        "No generated image returned"
      );

    }

    return {

      success: true,

      engine:
        "composite",

      provider:
        "openai",

      output: {

        image_url:
          imageUrl,

        prompt:
          compositePrompt,

        metadata: {

          provider:
            "openai",

          model:
            "gpt-image-1",

          mode:
            "composite-generation",

          assets_used:
            selectedAssets.length,

          venue_asset:
            venue?.id || null,

          performer_asset:
            performer?.id || null,

          cocktail_asset:
            cocktail?.id || null,

          food_asset:
            food?.id || null,

        },

      },

    };

  } catch (err) {

    console.error(
      "COMPOSITE ENGINE ERROR:",
      err
    );

    return {

      success: false,

      engine:
        "composite",

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