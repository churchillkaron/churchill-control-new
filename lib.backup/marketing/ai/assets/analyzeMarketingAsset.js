export async function analyzeMarketingAsset({

  fileUrl,

  assetType,

}) {

  try {

    // VERY EARLY VERSION
    // Later this becomes:
    // OpenAI Vision
    // GPT-4o Vision
    // Gemini Vision
    // Claude Vision
    // etc

    let description =
      "";

    let tags = [];

    let mood =
      "Luxury";

    let lighting =
      "Cinematic";

    let sceneType =
      "Hospitality";

    // BASIC RULES

    if (
      assetType ===
      "staff"
    ) {

      description =
        "Hospitality staff member";

      tags = [
        "staff",
        "hospitality",
        "service",
      ];

      sceneType =
        "Staff";

    }

    if (
      assetType ===
      "interior"
    ) {

      description =
        "Luxury hospitality venue interior";

      tags = [
        "interior",
        "venue",
        "hospitality",
      ];

      sceneType =
        "Interior";

    }

    return {

      description,

      tags,

      mood,

      lighting,

      sceneType,

    };

  } catch (err) {

    console.error(
      "ANALYZE MARKETING ASSET ERROR:",
      err
    );

    throw err;

  }

}