export default function buildStaffRuntime({

  staff = null,

  tables = [],

  orders = [],

  payments = [],

}) {

  const revenueToday =
    payments.reduce(
      (sum, payment) => {

        return (
          sum +
          Number(
            payment.amount_paid || 0
          )
        );

      },
      0
    );

  const activeTables =
    tables.length;

  const activeOrders =
    orders.length;

  let runtimeLevel =
    "NORMAL";

  let venueMood =
    "Calm luxury atmosphere";

  let nightlifePhase =
    "Warmup";

  let pressureLevel =
    "Controlled";

  let aiConfidence =
    "Stable";

  let shiftEnergy =
    "Smooth";

  if (
    revenueToday > 50000
  ) {

    runtimeLevel =
      "ELITE";

    venueMood =
      "High luxury momentum";

    nightlifePhase =
      "Peak Rush";

    pressureLevel =
      "Elevated";

    aiConfidence =
      "High";

    shiftEnergy =
      "Explosive";

  } else if (
    revenueToday > 25000
  ) {

    runtimeLevel =
      "HIGH";

    venueMood =
      "Strong nightlife flow";

    nightlifePhase =
      "Active Service";

    pressureLevel =
      "Moderate";

    aiConfidence =
      "Growing";

    shiftEnergy =
      "Dynamic";

  }

  return {

    staff: {

      id:
        staff?.id,

      name:
        staff?.name,

      role:
        staff?.role,

    },

    runtimeLevel,

    venueMood,

    nightlifePhase,

    pressureLevel,

    aiConfidence,

    shiftEnergy,

    revenueToday,

    activeTables,

    activeOrders,

    generatedAt:
      new Date()
        .toISOString(),

  };

}
