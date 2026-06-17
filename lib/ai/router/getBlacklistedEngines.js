export function getBlacklistedEngines({

  engineAnalytics = [],

}) {

  const now =
    Date.now();

  return engineAnalytics

    .filter((engine) => {

      const successRate =
        engine.successRate || 0;

      const averageScore =
        engine.averageScore || 0;

      const lastFailure =
        engine.lastFailure
          ? new Date(
              engine.lastFailure
            ).getTime()
          : null;

      const recentSuccessRate =
        engine.recentSuccessRate ||
        successRate;

      // RECOVERY WINDOW
      // 6 HOURS

      const cooldownActive =

        lastFailure &&

        (
          now - lastFailure
        ) < (

          1000 *
          60 *
          60 *
          6

        );

      // BLACKLIST RULES

      const severeFailure =

        successRate < 40 ||

        averageScore < 45;

      const poorRecentRecovery =

        recentSuccessRate < 60;

      return (

        severeFailure &&

        cooldownActive &&

        poorRecentRecovery

      );

    })

    .map(
      (engine) =>
        engine.engine
    );

}