export function getCampaignRecommendation(
  memory
) {

  if (!memory?.length) {

    return {

      mood:
        "Luxury Nightlife",

      lighting:
        "Cinematic Warm",

      composition:
        "Hero Shot",
    };
  }

  const top =
    memory[0];

  return {

    mood:
      top.mood,

    lighting:
      top.lighting,

    composition:
      top.composition,
  };
}