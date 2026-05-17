import publishEvent from "@/lib/intelligence/events/publishEvent";

import buildLiveCommandCenter from "@/lib/intelligence/live/buildLiveCommandCenter";

import detectAnomalies from "@/lib/intelligence/anomaly/detectAnomalies";

export default async function runRealtimeAIStream({
  tenant_id,
}) {

  try {

    const [
      command,
      anomalies,
    ] = await Promise.all([

      buildLiveCommandCenter({
        tenant_id,
      }),

      detectAnomalies({
        tenant_id,
      }),
    ]);

    const streamEvents = [];

    streamEvents.push({

      type:
        "LIVE_METRICS_UPDATED",

      payload: {
        revenue:
          command.revenue,

        operations:
          command.operations,

        performance:
          command.performance,

        customers:
          command.customers,
      },
    });

    if (
      anomalies.anomaly_count > 0
    ) {

      streamEvents.push({

        type:
          "ANOMALY_ALERT",

        payload: {
          count:
            anomalies.anomaly_count,
        },
      });
    }

    for (const event of streamEvents) {

      await publishEvent({
        tenant_id,
        type:
          event.type,
        payload:
          event.payload,
      });
    }

    return {
      success: true,

      streamed_events:
        streamEvents,

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
