export function analyzeEngineLearning({

  learningMemory = [],

}) {

  try {

    const campaignTypes = {};

    const failingEngines = [];

    const engineFailures = {};

    for (const item of learningMemory) {

      const type =
        item.campaign_type || "general";

      const engine =
        item.engine || "unknown";

      if (!campaignTypes[type]) {

        campaignTypes[type] = {};

      }

      if (
        !campaignTypes[type][engine]
      ) {

        campaignTypes[type][engine] = {

          total: 0,

          score: 0,

          success: 0,

          duration: 0,

        };

      }

      const bucket =

        campaignTypes[type][engine];

      bucket.total += 1;

      bucket.score +=
        item.performance_score || 0;

      bucket.duration +=
        item.avg_duration || 0;

      if (item.success) {

        bucket.success += 1;

      }

      // FAILURE TRACKING

      if (
        !engineFailures[engine]
      ) {

        engineFailures[engine] = {

          total: 0,

          failures: 0,

        };

      }

      engineFailures[
        engine
      ].total += 1;

      if (!item.success) {

        engineFailures[
          engine
        ].failures += 1;

      }

    }

    // BUILD STRATEGY

    const strategy = {};

    Object.entries(
      campaignTypes
    ).forEach(

      ([type, engines]) => {

        let bestEngine = null;

        let bestScore = -1;

        Object.entries(
          engines
        ).forEach(

          ([engine, data]) => {

            const avgScore =

              data.total

                ? (
                    data.score /
                    data.total
                  )

                : 0;

            const successRate =

              data.total

                ? (
                    data.success /
                    data.total
                  ) * 100

                : 0;

            const avgDuration =

              data.total

                ? (
                    data.duration /
                    data.total
                  )

                : 0;

            const weightedScore =

              (
                avgScore * 0.6
              ) +

              (
                successRate * 0.3
              ) +

              (
                (
                  100 -
                  avgDuration
                ) * 0.1
              );

            if (
              weightedScore >
              bestScore
            ) {

              bestScore =
                weightedScore;

              bestEngine = {

                engine,

                avgScore:
                  Math.round(
                    avgScore
                  ),

                successRate:
                  Math.round(
                    successRate
                  ),

                avgDuration:
                  Math.round(
                    avgDuration
                  ),

                confidence:
                  Math.min(
                    99,
                    Math.round(
                      weightedScore
                    )
                  ),

              };

            }

          }

        );

        strategy[type] = {

          bestEngine:
            bestEngine?.engine ||

            "full-ai",

          avgScore:
            bestEngine?.avgScore ||

            0,

          successRate:
            bestEngine?.successRate ||

            0,

          avgDuration:
            bestEngine?.avgDuration ||

            0,

          confidence:
            bestEngine?.confidence ||

            50,

        };

      }

    );

    // FAILING ENGINES

    Object.entries(
      engineFailures
    ).forEach(

      ([engine, stats]) => {

        const failureRate =

          stats.total

            ? (
                stats.failures /
                stats.total
              ) * 100

            : 0;

        if (
          failureRate > 25
        ) {

          failingEngines.push({

            engine,

            failureRate:
              Math.round(
                failureRate
              ),

            reason:
              "Failure rate above 25%",

          });

        }

      }

    );

    return {

      strategy,

      failingEngines,

    };

  } catch (err) {

    console.error(
      "ANALYZE ENGINE LEARNING ERROR:",
      err
    );

    return {

      strategy: {},

      failingEngines: [],

    };

  }

}