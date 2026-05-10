export function getCampaignRecommendation({

  assets = [],

  promptHistory = [],

}) {

  if (!assets.length) {

    return {

      mood:
        "Luxury",

      sceneType:
        "Nightlife",

      lighting:
        "Cinematic",

    };

  }

  const topAsset =
    [...assets].sort(

      (a, b) =>

        (b.score || 0) -
        (a.score || 0)

    )[0];

  const latestHistory =
    promptHistory?.[0];

  return {

    mood:

      latestHistory
        ?.recommendation
        ?.mood ||

      topAsset.analysis
        ?.mood ||

      "Luxury",

    sceneType:

      latestHistory
        ?.recommendation
        ?.campaignType ||

      topAsset.analysis
        ?.sceneType ||

      "Nightlife",

    lighting:

      latestHistory
        ?.recommendation
        ?.lighting ||

      topAsset.analysis
        ?.lighting ||

      "Cinematic",

  };

}