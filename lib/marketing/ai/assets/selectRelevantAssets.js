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

      return (

        searchText.includes(
          asset.scene_type
            ?.toLowerCase() || ""
        )

        ||

        tags.includes(
          "luxury"
        )

        ||

        description.includes(
          "hospitality"
        )

      );

    }
  );

}