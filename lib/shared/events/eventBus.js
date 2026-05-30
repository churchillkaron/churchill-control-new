import broadcastEvent
from "@/lib/realtime/broadcastEvent";

const listeners = {};

export function registerEvent(
  event,
  handler
) {

  if (!listeners[event]) {
    listeners[event] = [];
  }

  listeners[event].push(
    handler
  );

}

export async function emitEvent(
  event,
  payload = {}
) {

  console.log(
    "[EVENT_EMIT]",
    event
  );

  const handlers =
    listeners[event] || [];

  const handlerResults = [];

  for (const handler of handlers) {

    try {

      const result =
        await handler(payload);

      handlerResults.push({
        success: true,
        result,
      });

    } catch (error) {

      console.error(
        `[EVENT_HANDLER_FAILED] ${event}`,
        error
      );

      handlerResults.push({
        success: false,
        error:
          error.message,
      });

    }

  }

  let realtime = null;

  try {

    realtime =
      await broadcastEvent({

        channel:
          "enterprise-runtime",

        event,

        payload: {
          event,
          payload,
          timestamp:
            new Date().toISOString(),
        },

      });

  } catch (error) {

    console.error(
      "[REALTIME_BROADCAST_FAILED]",
      error
    );

  }

  return {
    success: true,
    event,
    handlers:
      handlerResults,
    realtime,
  };

}
