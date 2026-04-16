export function getControlData() {
  const data = {
    revenue: 128450,
    foodCost: 38000,
    staffCost: 42000,
    otherCost: 12000,
  };

  const totalCost = data.foodCost + data.staffCost + data.otherCost;
  const profit = data.revenue - totalCost;
  const margin = Math.round((profit / data.revenue) * 100);

  // 🔥 STAFF SCORING SYSTEM

  let fohScore = margin > 30 ? 90 : margin > 20 ? 70 : 50;
  let barScore = 60; // simulate weak
  let kitchenScore = 75; // stable

  const averageScore = Math.round(
    (fohScore + barScore + kitchenScore) / 3
  );

  // 🔥 PAYOUT LOGIC (NOW BASED ON SCORE + PROFIT)

  let payoutStatus = "GOOD";
  let payoutLevel = 100;

  if (margin < 30 || averageScore < 70) {
    payoutStatus = "WARNING";
    payoutLevel = 70;
  }

  if (margin < 20 || averageScore < 60) {
    payoutStatus = "BAD";
    payoutLevel = 40;
  }

  if (margin < 10 || averageScore < 50) {
    payoutStatus = "CRITICAL";
    payoutLevel = 0;
  }

  const servicePool = Math.round(data.revenue * 0.05);
  const payoutPool = Math.round((servicePool * payoutLevel) / 100);

  const fohShare = Math.round(payoutPool * 0.5);
  const barShare = Math.round(payoutPool * 0.3);
  const kitchenShare = Math.round(payoutPool * 0.2);

  // 🔥 DECISIONS

  let decisions = [];

  if (fohScore < 70) {
    decisions.push({
      type: "FOH",
      message: "Front staff not maximizing sales",
      color: "red",
    });
  }

  if (barScore < 70) {
    decisions.push({
      type: "Bar",
      message: "Bar underperforming — push drinks",
      color: "red",
    });
  }

  if (kitchenScore < 70) {
    decisions.push({
      type: "Kitchen",
      message: "Kitchen efficiency can improve",
      color: "#ccc",
    });
  }

  return {
    data,
    totalCost,
    profit,
    margin,
    payoutStatus,
    payoutLevel,
    payoutPool,
    fohShare,
    barShare,
    kitchenShare,
    decisions,
    fohScore,
    barScore,
    kitchenScore,
    averageScore,
  };
}