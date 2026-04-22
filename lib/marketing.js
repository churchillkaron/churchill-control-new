export function generateCampaign(input) {
  const campaigns = [];

  if (input.drinks > input.dinner) {
    campaigns.push({
      title: "Cocktail Night Push",
      text: "Join us tonight for handcrafted cocktails, great music, and energy at Churchill 🍸",
      hashtags: "#cocktails #phuketnightlife #churchill",
    });
  }

  if (input.games > 0 && input.games < input.drinks) {
    campaigns.push({
      title: "Game Night Promotion",
      text: "Pool, darts, shuffleboard — bring your friends and play the night away 🎯",
      hashtags: "#gamenight #phuketfun #churchill",
    });
  }

  if (input.topCustomers > 0) {
    campaigns.push({
      title: "VIP Experience Night",
      text: "Exclusive nights, premium vibes, and unforgettable experiences at Churchill ⭐",
      hashtags: "#vipnight #phuketrestaurant #churchill",
    });
  }

  if (input.revenue < 10000) {
    campaigns.push({
      title: "Midweek Energy Boost",
      text: "Dinner, drinks, live music — everything you need for the perfect night 🍷",
      hashtags: "#phuketrestaurant #livemusic #churchill",
    });
  }

  return campaigns;
}