// /lib/performance.js

export function calculateFOH(orders) {
  const revenue = orders.reduce(
    (sum, o) => sum + (o.items || []).reduce((s, i) => s + i.price, 0),
    0
  );

  const orderCount = orders.length;
  const avg = orderCount ? revenue / orderCount : 0;

  const score =
    revenue * 0.5 +
    orderCount * 0.3 +
    avg * 0.2;

  return {
    score: Math.round(score),
    revenue,
    orderCount,
    avg: Math.round(avg),
  };
}

export function calculateBar(wasteTHB = 0) {
  const score = Math.max(0, 100 - wasteTHB);

  return {
    score,
    wasteTHB,
  };
}

export function calculateKitchen(costPercent = 0) {
  const score = Math.max(0, 100 - costPercent);

  return {
    score,
    costPercent,
  };
}

export function getPerformanceLevel(score) {
  if (score >= 80) return { level: "GOOD", multiplier: 1 };
  if (score >= 60) return { level: "WARNING", multiplier: 0.7 };
  if (score >= 40) return { level: "BAD", multiplier: 0.4 };
  return { level: "CRITICAL", multiplier: 0.2 };
}

export function getServiceLevel(avgScore) {
  if (avgScore >= 80) return 7;
  if (avgScore >= 70) return 6;
  return 5;
}