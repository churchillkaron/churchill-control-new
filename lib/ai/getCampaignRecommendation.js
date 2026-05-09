export function getCampaignRecommendation(
  campaigns = []
) {

  if (!campaigns.length) {

    return {
      bestMood:
        "Luxury Nightlife",

      bestLighting:
        "Cinematic Warm",

      bestAtmosphere:
        "Energetic",
    };

  }

  const sorted =
    [...campaigns].sort(
      (a, b) =>
        (b.performance_score || 0) -
        (a.performance_score || 0)
    );

  const best =
    sorted[0];

  return {

    bestMood:
      best.mood,

    bestLighting:
      best.lighting,

    bestAtmosphere:
      best.atmosphere,

  };

}