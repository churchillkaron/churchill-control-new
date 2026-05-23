export default function generateRealtimeFeed({

  tables = [],

  orders = [],

  payments = [],

  notifications = [],

  runtimeLevel = "NORMAL",

  venueMood = "Stable Runtime",

}) {

  const feed = [];

  // =====================================
  // VIP / TABLE ENERGY
  // =====================================

  tables.forEach((table) => {

    if (
      table.status ===
      "OCCUPIED"
    ) {

      feed.push({

        type: "VIP",

        icon: "🍾",

        title:
          "VIP Momentum Rising",

        message:
          `Energy building around Table ${table.table_number || table.name}. AI detects strong nightlife movement.`,

        mood:
          "fuchsia",

        created_at:
          new Date()
            .toISOString(),

      });

    }

  });

  // =====================================
  // KITCHEN FLOW
  // =====================================

  const readyOrders =
    orders.filter(
      (o) =>
        o.status ===
        "READY"
    );

  if (
    readyOrders.length >= 3
  ) {

    feed.push({

      type: "KITCHEN",

      icon: "🔥",

      title:
        "Kitchen recovered from pressure",

      message:
        `${readyOrders.length} dishes completed during active rush flow.`,

      mood:
        "emerald",

      created_at:
        new Date()
          .toISOString(),

    });

  }

  // =====================================
  // REVENUE ENERGY
  // =====================================

  const revenue =
    payments.reduce(
      (sum, p) =>
        sum +
        Number(
          p.amount_paid || 0
        ),
      0
    );

  if (
    revenue > 50000
  ) {

    feed.push({

      type: "REVENUE",

      icon: "💎",

      title:
        "Luxury revenue momentum",

      message:
        `Venue crossed ฿${revenue.toLocaleString()} tonight. Premium guest behavior increasing.`,

      mood:
        "amber",

      created_at:
        new Date()
          .toISOString(),

    });

  }

  // =====================================
  // RUNTIME STATE
  // =====================================

  feed.push({

    type: "RUNTIME",

    icon: "🧠",

    title:
      "Churchill Runtime",

    message:
      `${venueMood}. Runtime level currently ${runtimeLevel}. AI orchestration active.`,

    mood:
      "cyan",

    created_at:
      new Date()
        .toISOString(),

  });

  // =====================================
  // NOTIFICATIONS
  // =====================================

  notifications.forEach((n) => {

    feed.push({

      type:
        n.type ||

        "ALERT",

      icon: "⚠️",

      title:
        n.title ||

        "Operational Alert",

      message:
        n.message ||

        "AI detected operational movement.",

      mood:
        "red",

      created_at:
        new Date()
          .toISOString(),

    });

  });


  // =====================================
  // AI WHISPERS
  // =====================================

  if (
    revenue > 80000
  ) {

    feed.unshift({

      type: "WHISPER",

      icon: "🥂",

      title:
        "AI Whisper",

      message:
        "Premium spending window detected. Recommend champagne and bottle upsells now.",

      mood:
        "amber",

      created_at:
        new Date()
          .toISOString(),

    });

  }

  if (
    readyOrders.length > 6
  ) {

    feed.unshift({

      type: "WHISPER",

      icon: "🔥",

      title:
        "Kitchen Pressure",

      message:
        "AI predicts elevated kitchen pressure in the next 15 minutes.",

      mood:
        "red",

      created_at:
        new Date()
          .toISOString(),

    });

  }

  if (
    tables.length >= 8
  ) {

    feed.unshift({

      type: "WHISPER",

      icon: "🍾",

      title:
        "VIP Movement",

      message:
        "Strong nightlife momentum detected across active tables.",

      mood:
        "fuchsia",

      created_at:
        new Date()
          .toISOString(),

    });

  }



  return feed
    .slice(0, 15);

}
