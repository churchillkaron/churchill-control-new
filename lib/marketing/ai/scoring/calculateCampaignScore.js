export function calculateCampaignScore(
  analytics
) {

  if (!analytics?.data) {

    return 0;

  }

  let score = 0;

  for (const metric of analytics.data) {

    const value =
      metric.values?.[0]?.value || 0;

    switch (metric.name) {

      case "likes":
        score += value * 1;
        break;

      case "comments":
        score += value * 3;
        break;

      case "shares":
        score += value * 5;
        break;

      case "saved":
        score += value * 4;
        break;

      case "reach":
        score += value * 0.1;
        break;

      case "impressions":
        score += value * 0.05;
        break;

    }

  }

  return Math.round(score);

}