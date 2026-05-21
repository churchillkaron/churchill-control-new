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

  // 🔥 INDIVIDUAL STAFF DATA

  const staff = [
    { name: "Anna", role: "FOH", score: 85 },
    { name: "John", role: "FOH", score: 70 },
    { name: "Mike", role: "Bar", score: 55 },
    { name: "Lisa", role: "Bar", score: 65 },
    { name: "Somchai", role: "Kitchen", score: 80 },
    { name: "Nok", role: "Kitchen", score: 72 },
  ];

  // 🔥 TEAM AVERAGE

  const foh = staff.filter(s => s.role === "FOH");
  const bar = staff.filter(s => s.role === "Bar");
  const kitchen = staff.filter(s => s.role === "Kitchen");

  const avg = arr =>
    Math.round(arr.reduce((sum, s) => sum + s.score, 0) / arr.length);

  const fohScore = avg(foh);
  const barScore = avg(bar);
  const kitchenScore = avg(kitchen);

  const averageScore = Math.round(
    (fohScore + barScore + kitchenScore) / 3
  );

  // 🔥 PAYOUT LOGIC

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

  // 🔥 DISTRIBUTION PER ROLE

  const roleSplit = {
    FOH: 0.5,
    Bar: 0.3,
    Kitchen: 0.2,
  };

  // 🔥 DISTRIBUTE PER PERSON (based on score)

  const roleGroups = {
    FOH: foh,
    Bar: bar,
    Kitchen: kitchen,
  };

  const staffWithPayout = staff.map(member => {
    const group = roleGroups[member.role];
    const totalScore = group.reduce((sum, s) => sum + s.score, 0);

    const rolePool = payoutPool * roleSplit[member.role];
    const share = Math.round((member.score / totalScore) * rolePool);

    return {
      ...member,
      payout: share,
    };
  });

  return {
    data,
    profit,
    margin,
    payoutStatus,
    payoutLevel,
    payoutPool,
    staffWithPayout,
    fohScore,
    barScore,
    kitchenScore,
    averageScore,
  };
}