export function calculateCampaignScore({
  engagement = 0,
  conversions = 0,
  aiRating = 0,
}) {

  return (

    engagement * 0.5 +

    conversions * 0.3 +

    aiRating * 0.2
  );
}