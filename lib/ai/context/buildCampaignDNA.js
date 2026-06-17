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

    businessRoles:

      assets.map(
        (a) =>

          a.analysis
            ?.identity
            ?.business_role ||

          a.analysis
            ?.identity
            ?.hospitality_role
      ),

    cinematicStyle:
      "Commercial Marketing",

  };

}