export function selectRelevantAssets({

  assets,

  campaignType,

  mood,

  atmosphere,

}) {

  const searchText = `
${campaignType}
${mood}
${atmosphere}
`.toLowerCase();

  return assets.filter(
    (asset) => {

      const tags =
        (
          asset.tags || []
        ).join(" ")
        .toLowerCase();

      const description =
        (
          asset.description || ""
        ).toLowerCase();

      const industryTags =
        (
          asset.analysis?.industry_tags || []
        ).join(" ")
        .toLowerCase();

      const campaignFit =
        (
          asset.analysis?.campaign_fit || []
        ).join(" ")
        .toLowerCase();

      const commercialUseCases =
        (
          asset.analysis?.commercial_use_cases || []
        ).join(" ")
        .toLowerCase();

      return (

        searchText.includes(
          asset.scene_type
            ?.toLowerCase() || ""
        )

        ||

        industryTags.includes(
          campaignType?.toLowerCase() || ""
        )

        ||

        campaignFit.includes(
          campaignType?.toLowerCase() || ""
        )

        ||

        commercialUseCases.includes(
          campaignType?.toLowerCase() || ""
        )

      );

    }
  );

}