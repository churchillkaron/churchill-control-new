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

  let payoutStatus = "GOOD";
  let payoutLevel = 100;

  if (margin < 30) {
    payoutStatus = "WARNING";
    payoutLevel = 70;
  }

  if (margin < 20) {
    payoutStatus = "BAD";
    payoutLevel = 40;
  }

  if (margin < 10) {
    payoutStatus = "CRITICAL";
    payoutLevel = 0;
  }

  const servicePool = Math.round(data.revenue * 0.05);
  const payoutPool = Math.round((servicePool * payoutLevel) / 100);

  const fohShare = Math.round(payoutPool * 0.5);
  const barShare = Math.round(payoutPool * 0.3);
  const kitchenShare = Math.round(payoutPool * 0.2);

  let decisions = [];

  if (margin > 30) {
    decisions.push({
      type: "Profit",
      message: "Strong margin — opportunity to scale revenue",
      color: "#ffb36b",
    });
  }

  if (margin < 20) {
    decisions.push({
      type: "Warning",
      message: "Margin dropping — payout reduced to protect business",
      color: "red",
    });
  }

  if (data.foodCost > 40000) {
    decisions.push({
      type: "Cost",
      message: "Food cost high — review suppliers or portion size",
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
  };
}