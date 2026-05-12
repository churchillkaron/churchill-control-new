export function calculateEngineHealth({

  engineAnalytics = [],

}) {

  try {

    return engineAnalytics.map(
      (engine) => {

        const successRate =
          engine.successRate || 0;

        const averageScore =
          engine.averageScore || 0;

        const avgDuration =
          engine.avgDuration || 0;

        const retryRate =

          engine.totalJobs

            ? (
                (
                  engine.retryCount || 0
                ) /

                engine.totalJobs
              ) * 100

            : 0;

        const recentSuccessRate =
          engine.recentSuccessRate ||
          successRate;

        // HEALTH MODEL

        const healthScore =

          (
            successRate * 0.35
          ) +

          (
            averageScore * 0.35
          ) +

          (
            (
              100 -
              Math.min(
                avgDuration,
                100
              )
            ) * 0.15
          ) +

          (
            (
              100 -
              retryRate
            ) * 0.15
          );

        // RECOVERY BONUS

        const recoveryBonus =

          recentSuccessRate >
          successRate

            ? 5

            : 0;

        const finalHealth =

          Math.min(

            99,

            Math.round(
              healthScore +
              recoveryBonus
            )

          );

        // STATUS

        let healthStatus =
          "healthy";

        if (
          finalHealth < 75
        ) {

          healthStatus =
            "warning";

        }

        if (
          finalHealth < 60
        ) {

          healthStatus =
            "degraded";

        }

        if (
          finalHealth < 40
        ) {

          healthStatus =
            "critical";

        }

        return {

          ...engine,

          healthScore:
            finalHealth,

          healthStatus,

        };

      }
    );

  } catch (err) {

    console.error(
      "CALCULATE ENGINE HEALTH ERROR:",
      err
    );

    return [];

  }

}