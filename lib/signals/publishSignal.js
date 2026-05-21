import { broadcastEvent } from "@/lib/realtime/broadcastEvent";

export async function publishSignal({

  type,

  payload = {},

  tenantId,

}) {

  const signal = {

    type,

    payload,

    tenantId,

    timestamp:
      new Date().toISOString(),

  };

  console.log(
    "[SIGNAL]",
    signal
  );

  try {

    await broadcastEvent({

      channel:
        "enterprise-signals",

      event:
        type,

      payload:
        signal,

    });

  } catch (error) {

    console.error(
      "[SIGNAL_ERROR]",
      error
    );

  }

  return signal;

}
