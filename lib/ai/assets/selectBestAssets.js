export function selectBestAssets({

  assets = [],

  mood,

  sceneType,

  limit = 4,

}) {

  let filtered =
    [...assets];

  // MOOD MATCHING

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

  // SCENE MATCHING

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

  // FALLBACK

  if (!filtered.length) {

    filtered =
      [...assets];

  }

  // PERFORMANCE SORTING

  filtered.sort(

    (a, b) => {

      let aValue = 0;
      let bValue = 0;

      // BASE SCORE

      aValue +=
        (a.score || 0);

      bValue +=
        (b.score || 0);

      // PERFORMANCE SCORE

      aValue +=
        (
          a.last_performance_score || 0
        ) * 5;

      bValue +=
        (
          b.last_performance_score || 0
        ) * 5;

      // USAGE CONFIDENCE

      aValue +=
        (a.usage_count || 0) * 2;

      bValue +=
        (b.usage_count || 0) * 2;

      // HOSPITALITY BONUS

      if (
        a.analysis?.identity
          ?.business_role ||

        a.analysis?.identity
          ?.hospitality_role
      ) {

        aValue += 15;

      }

      if (
        b.analysis?.identity
          ?.business_role ||

        b.analysis?.identity
          ?.hospitality_role
      ) {

        bValue += 15;

      }

      // PREMIUM VISUAL BONUS

      if (
        a.analysis?.quality ===
        "premium"
      ) {

        aValue += 10;

      }

      if (
        b.analysis?.quality ===
        "premium"
      ) {

        bValue += 10;

      }

      return bValue - aValue;

    }

  );

  return filtered.slice(
    0,
    limit
  );

}