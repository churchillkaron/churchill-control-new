export default function OperationsExecutionFeed({

  jobs,

  queue,

  campaigns,

}) {

  const events = [];

  // GENERATION EVENTS

  jobs.forEach((job) => {

    events.push({

      type:
        "generation",

      timestamp:
        job.created_at,

     title:
  `${job.engine?.toUpperCase()} generation started`,

provider:
  job.provider || "unknown",

duration:

  job.completed_at &&
  job.started_at

    ? Math.floor(

        (
          new Date(
            job.completed_at
          ) -

          new Date(
            job.started_at
          )

        ) / 1000

      )

    : null,

retryCount:
  job.retry_count || 0,

      status:
        job.status,

    });

    if (
      job.status === "completed"
    ) {

      events.push({

        type:
          "generation-success",

        timestamp:
          job.completed_at,

        title:
          "AI image generated successfully",

        status:
          "completed",

      });

    }

    if (
      job.status === "failed"
    ) {

      events.push({

        type:
          "generation-failed",

        timestamp:
          job.updated_at ||
          job.created_at,

        title:
          "Generation failed",

        status:
          "failed",

      });

    }

  });

  // QUEUE EVENTS

  queue.forEach((item) => {

    events.push({

      type:
        "queue",

      timestamp:
        item.created_at,

      title:
        "Campaign queued for publishing",

      status:
        item.status,

    });

    if (
      item.retry_count > 0
    ) {

      events.push({

        type:
          "retry",

        timestamp:
          item.updated_at ||
          item.created_at,

        title:
          `Publishing retry triggered (${item.retry_count})`,

        status:
          "retrying",

      });

    }

    if (
      item.status === "published"
    ) {

      events.push({

        type:
          "published",

        timestamp:
          item.published_at,

        title:
          "Campaign published successfully",

        status:
          "published",

      });

    }

  });

  // CAMPAIGN EVENTS

  campaigns.forEach(
    (campaign) => {

      if (
        campaign.performance_score
      ) {

        events.push({

          type:
            "performance",

          timestamp:
            campaign.updated_at ||
            campaign.created_at,

          title:
            `Campaign performance score: ${campaign.performance_score}`,

          status:
            "performance",

        });

      }

    }
  );

  // SORT EVENTS

  events.sort(
    (a, b) => {

      return (
        new Date(b.timestamp) -
        new Date(a.timestamp)
      );

    }
  );

  return (

    <div>

      <div className="text-lg font-semibold mb-4">
        AI Execution Feed
      </div>

      <div className="space-y-3 max-h-[900px] overflow-y-auto pr-2">

        {events.map(
          (event, index) => (

            <div
              key={index}
              className="
                bg-white/5
                border
                border-white/10
                rounded-2xl
                p-4
              "
            >

              <div className="flex items-center justify-between">

                <div
                  className={`

                    text-xs
                    uppercase
                    tracking-[0.15em]

                    ${
                      event.status === "failed"

                        ? "text-red-400"

                        : event.status === "published"

                        ? "text-green-400"

                        : event.status === "retrying"

                        ? "text-yellow-400"

                        : "text-white/40"

                    }

                  `}
                >

                  {event.status}

                </div>

                <div className="text-white/30 text-xs">

                  {event.timestamp
                    ? new Date(
                        event.timestamp
                      ).toLocaleString()
                    : "-"}

                </div>

              </div>

              <div className="mt-3 text-sm">
                {event.title}
              </div>
<div className="mt-3 flex items-center gap-4 text-xs text-white/40">

  {event.provider && (

    <div>
      Provider: {event.provider}
    </div>

  )}

  {event.duration !== null && (

    <div>
      Duration: {event.duration}s
    </div>

  )}

  {event.retryCount > 0 && (

    <div className="text-yellow-400">
      Retries: {event.retryCount}
    </div>

  )}

</div>
            </div>

        ))}

      </div>

    </div>

  );

}