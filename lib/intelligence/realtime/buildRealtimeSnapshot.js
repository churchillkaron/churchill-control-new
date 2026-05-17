import buildLiveCommandCenter from "@/lib/intelligence/live/buildLiveCommandCenter";

import getEvents from "@/lib/intelligence/events/getEvents";

export default async function buildRealtimeSnapshot({
  tenant_id,
}) {

  try {

    const [
      command,
      events,
    ] = await Promise.all([

      buildLiveCommandCenter({
        tenant_id,
      }),

      getEvents({
        tenant_id,
      }),
    ]);

    return {
      success: true,

      metrics: {
        revenue:
          command.revenue,

        operations:
          command.operations,

        performance:
          command.performance,

        customers:
          command.customers,
      },

      alerts:
        command.alerts || [],

      recent_events:
        events.events
          ?.slice(0, 10) || [],

      updated_at:
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
