import { publishSignal } from "@/lib/signals/publishSignal";

import { processSignal } from "@/lib/orchestration/processSignal";

export async function emitEvent({

  type,

  payload = {},

  tenantId,

}) {

  const signal =
    await publishSignal({

      type,

      payload,

      tenantId,

    });

  await processSignal({

    signal,

  });

  return signal;

}
