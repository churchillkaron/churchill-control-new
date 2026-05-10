export function selectBestAssets({

  assets = [],

  mood,

  sceneType,

  limit = 4,

}) {

  let filtered =
    [...assets];

  if (mood) {

    filtered =
      filtered.filter(

        (asset) =>

          asset.analysis?.mood
            ?.toLowerCase()
            .includes(
              mood.toLowerCase()
            )

      );

  }

  if (sceneType) {

    filtered =
      filtered.filter(

        (asset) =>

          asset.analysis?.sceneType
            ?.toLowerCase()
            .includes(
              sceneType.toLowerCase()
            )

      );

  }

  filtered.sort(

    (a, b) => {

      let aValue =

        (a.score || 0) +
        ((a.usage_count || 0) * 2);

      let bValue =

        (b.score || 0) +
        ((b.usage_count || 0) * 2);

      if (
        a.analysis?.identity
          ?.hospitality_role
      ) {

        aValue += 15;

      }

      if (
        b.analysis?.identity
          ?.hospitality_role
      ) {

        bValue += 15;

      }

      return bValue - aValue;

    }

  );

  return filtered.slice(
    0,
    limit
  );

}