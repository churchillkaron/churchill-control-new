import { createServerSupabase } from "@/lib/shared/supabase/server";

const supabase = createServerSupabase();

export async function getOperationalAlerts({

  tenantId,

  pageId,

}) {

  try {

    const alerts = [];

    // GENERATION JOBS

    const {
      data: jobs,
    } = await supabase

      .from(
        "generation_jobs"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .eq(
        "page_id",
        pageId
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      )

      .limit(50);

    // PUBLISH QUEUE

    const {
      data: queue,
    } = await supabase

      .from(
        "campaign_publish_queue"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .eq(
        "page_id",
        pageId
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      )

      .limit(50);

    // CAMPAIGNS

    const {
      data: campaigns,
    } = await supabase

      .from(
        "marketing_campaigns"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .eq(
        "page_id",
        pageId
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      )

      .limit(50);


    // FAILED GENERATIONS

    const failedJobs =
      jobs?.filter(
        (j) =>
          j.status === "failed"
      ) || [];

    const failedRate =

      jobs?.length

        ? (
            failedJobs.length /
            jobs.length
          ) * 100

        : 0;

    if (failedRate >= 25) {

      alerts.push({

        level:
          "critical",

        title:
          "Generation failure rate high",

        message:
          `Generation failure rate is currently ${failedRate.toFixed(1)}%.`,

      });

    }

    // FAILED PUBLISHING

    const failedPublishing =
      queue?.filter(
        (q) =>
          q.status === "failed"
      ) || [];

    if (
      failedPublishing.length >= 3
    ) {

      alerts.push({

        level:
          "high",

        title:
          "Publishing failures detected",

        message:
          `${failedPublishing.length} publishing jobs have failed recently.`,

      });

    }

    // LOW CAMPAIGN ACTIVITY

    if (
      campaigns?.length
    ) {

      const latestCampaign =
        campaigns[0];

      const lastCampaignDate =
        new Date(
          latestCampaign.created_at
        );

      const now =
        new Date();

      const daysSince =
        Math.floor(

          (
            now -
            lastCampaignDate
          ) /

          (
            1000 *
            60 *
            60 *
            24
          )

        );

      if (daysSince >= 5) {

        alerts.push({

          level:
            "medium",

          title:
            "Low campaign activity",

          message:
            `No new campaigns created in ${daysSince} days.`,

        });

      }

    }

    // LOW LEARNING CONFIDENCE

    if (
      (campaigns?.length || 0) < 5
    ) {

      alerts.push({

        level:
          "low",

        title:
          "Low AI learning confidence",

        message:
          "The AI system needs more campaign data to improve optimization accuracy.",

      });

    }

    // PERFORMANCE DECLINE

    if (
      campaigns?.length >= 10
    ) {

      const recent =
        campaigns
          .slice(0, 5)
          .reduce(

            (sum, c) =>

              sum +
              (
                c.performance_score || 0
              ),

            0

          ) / 5;

      const older =
        campaigns
          .slice(5, 10)
          .reduce(

            (sum, c) =>

              sum +
              (
                c.performance_score || 0
              ),

            0

          ) / 5;

      if (recent < older * 0.6) {

        alerts.push({

          level:
            "high",

          title:
            "Campaign performance decline",

          message:
            "Campaign performance has dropped significantly compared to previous campaigns.",

        });

      }

    }

    return {

      success: true,

      alerts,

    };

  } catch (err) {

    console.error(
      "GET OPERATIONAL ALERTS ERROR:",
      err
    );

    return {

      success: false,

      alerts: [],

      error:
        err.message,

    };

  }

}