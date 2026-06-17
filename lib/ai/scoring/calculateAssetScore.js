export function calculateAssetScore({

  analysis,

}) {

  let score = 0;

  score +=
    analysis?.brand_alignment_score ??
    analysis?.luxuryScore ??
    0;

  score +=
    analysis?.industry_relevance_score ??
    analysis?.nightlifeScore ??
    0;

  if (
    analysis?.mood ===
    "Luxury"
  ) {

    score += 15;

  }

  if (
    analysis?.lighting ===
    "Cinematic"
  ) {

    score += 10;

  }

  if (
    analysis?.identity
      ?.business_role ||

    analysis?.identity
      ?.hospitality_role
  ) {

    score += 20;

  }

  return score;

}