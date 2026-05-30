export default function buildOperationalScore({

  revenueToday = 0,

  activeOrders = 0,

  delayedOrders = 0,

  vipTables = 0,

}) {

  let score = 50;

  // =====================================
  // REVENUE
  // =====================================

  if (
    revenueToday > 100000
  ) {

    score += 30;

  } else if (
    revenueToday > 50000
  ) {

    score += 20;

  } else if (
    revenueToday > 20000
  ) {

    score += 10;

  }

  // =====================================
  // VIP TABLES
  // =====================================

  score += (
    vipTables * 5
  );

  // =====================================
  // ACTIVE FLOW
  // =====================================

  if (
    activeOrders > 20
  ) {

    score += 10;

  }

  // =====================================
  // DELAYS
  // =====================================

  score -= (
    delayedOrders * 3
  );

  // =====================================
  // LIMITS
  // =====================================

  if (score > 100)
    score = 100;

  if (score < 0)
    score = 0;

  let level =
    "NORMAL";

  if (score >= 90)
    level = "ELITE";

  else if (score >= 75)
    level = "HIGH";

  else if (score >= 60)
    level = "GOOD";

  else if (score >= 40)
    level = "WARNING";

  else
    level = "CRITICAL";

  return {

    score,

    level,

  };

}
