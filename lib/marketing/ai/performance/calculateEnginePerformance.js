export function calculateEnginePerformance({

  jobs = [],

  campaigns = [],

}) {

  try {

    const engines = {};

    for (const job of jobs) {

      const engine =
        job.engine || "unknown";

      if (!engines[engine]) {

        engines[engine] = {

          engine,

          totalJobs: 0,

          completedJobs: 0,

          failedJobs: 0,

          totalDuration: 0,

          durationCount: 0,

          totalCampaigns: 0,

          totalScore: 0,

          averageScore: 0,

          avgDuration: 0,

          successRate: 0,

        };

      }

      const engineData =
        engines[engine];

      engineData.totalJobs += 1;

      if (
        job.status === "completed"
      ) {

        engineData.completedJobs += 1;

      }

      if (
        job.status === "failed"
      ) {

        engineData.failedJobs += 1;

      }

      // DURATION

      if (
        job.started_at &&
        job.completed_at
      ) {

        const duration =

          (
            new Date(
              job.completed_at
            ) -

            new Date(
              job.started_at
            )

          ) / 1000;

        if (
          duration > 0
        ) {

          engineData.totalDuration +=
            duration;

          engineData.durationCount += 1;

        }

      }

      // MATCH CAMPAIGN

      const relatedCampaign =
        campaigns.find(
          (campaign) =>

            campaign.id ===
            job.campaign_id
        );

      if (
        relatedCampaign?.performance_score
      ) {

        engineData.totalCampaigns += 1;

        engineData.totalScore +=

          relatedCampaign.performance_score;

      }

    }

    // CALCULATIONS

    Object.values(
      engines
    ).forEach((engine) => {

      engine.successRate =

        engine.totalJobs

          ? Math.round(

              (
                engine.completedJobs /

                engine.totalJobs

              ) * 100

            )

          : 0;

      engine.avgDuration =

        engine.durationCount

          ? Math.round(

              engine.totalDuration /

              engine.durationCount

            )

          : 0;

      engine.averageScore =

        engine.totalCampaigns

          ? Math.round(

              engine.totalScore /

              engine.totalCampaigns

            )

          : 0;

    });

    return Object.values(
      engines
    )

      .sort(
        (a, b) =>

          b.averageScore -
          a.averageScore
      );

  } catch (err) {

    console.error(
      "CALCULATE ENGINE PERFORMANCE ERROR:",
      err
    );

    return [];

  }

}