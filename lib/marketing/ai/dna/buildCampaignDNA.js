export function buildCampaignDNA({

  assets = [],

  recommendation,

}) {

  return {

    mood:
      recommendation?.mood,

    lighting:
      recommendation?.lighting,

    sceneType:
      recommendation?.sceneType,

    dominantAssetTypes:

      assets.map(
        (a) =>
          a.asset_type
      ),

    hospitalityRoles:

      assets.map(
        (a) =>

          a.analysis
            ?.identity
            ?.hospitality_role
      ),

    cinematicStyle:
      "Luxury Hospitality",

  };

}