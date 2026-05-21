import { getBlacklistedEngines }
from "@/lib/marketing/ai/decision/getBlacklistedEngines";

export function getBestEngineForCampaign({

  campaignType,

  enginePerformance = [],

}) {

  try {

    if (
      !enginePerformance?.length
    ) {

      return {

        engine:
          "full-ai",

        confidence: 50,

        reason:
          "No engine performance data available yet.",

      };

    }

    let ranked =
      [...enginePerformance];

    // CAMPAIGN TYPE PREFERENCES

    ranked = ranked.map(
      (engine) => {

        let bonus = 0;

        // COCKTAILS

        if (
          campaignType ===
            "cocktail" &&

          engine.engine ===
            "full-ai"
        ) {

          bonus += 20;

        }

        // INTERIORS

        if (
          campaignType ===
            "interior" &&

          engine.engine ===
            "composite"
        ) {

          bonus += 20;

        }

        // FAST PROMOS

        if (
          campaignType ===
            "promo" &&

          engine.engine ===
            "enhance"
        ) {

          bonus += 20;

        }

        // VIDEO

        if (
          campaignType ===
            "video" &&

          engine.engine ===
            "video"
        ) {

          bonus += 25;

        }

        // SCORE MODEL

        const finalScore =

          (
            engine.averageScore * 0.5
          ) +

          (
            engine.successRate * 0.3
          ) +

          (
            (
              100 -
              engine.avgDuration
            ) * 0.2
          ) +

          bonus;

        return {

          ...engine,

          finalScore,

        };

      }
    );

    ranked.sort(
      (a, b) =>

        b.finalScore -
        a.finalScore
    );

    // REMOVE FAILING ENGINES
const blacklistedEngines =

  getBlacklistedEngines({

    engineAnalytics:
      ranked,

  });
const healthyEngines =

  ranked.filter(
    (engine) =>

      engine.successRate >= 70 &&

!blacklistedEngines.includes(
  engine.engine
)
  );

// FALLBACK IF ALL FAILING

const best =

  healthyEngines?.length

    ? healthyEngines[0]

    : ranked[0];

    let confidence =

  Math.min(

    99,

    Math.round(
      best.finalScore
    )

  );

// SAFETY FALLBACK

if (
  confidence < 70
) {

  return {

    engine:
      "full-ai",

    confidence,

    reason:
      "Fallback triggered due to low orchestration confidence.",

    metrics: {

      averageScore:
        best.averageScore,

      successRate:
        best.successRate,

      avgDuration:
        best.avgDuration,

    },

  };

}

    return {

      engine:
        best.engine,

      confidence,

      reason:

        `${best.engine} selected because it has the best combined performance, success rate, and execution speed for ${campaignType} campaigns.`,

      metrics: {

        averageScore:
          best.averageScore,

        successRate:
          best.successRate,

        avgDuration:
          best.avgDuration,

      },

    };

  } catch (err) {

    console.error(
      "GET BEST ENGINE ERROR:",
      err
    );

    return {

      engine:
        "full-ai",

      confidence: 50,

      reason:
        "Fallback engine selected due to orchestration error.",

    };

  }

}