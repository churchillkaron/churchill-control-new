import {
  registerEventHandler,
} from "@/lib/platform/eventRouter";

import {
  emitEvent,
} from "@/lib/pos/core/posEventEngine";


registerEventHandler(
  "POS_EVENT",
  async (event) => {

    emitEvent(
      "GLOBAL",
      event,
    );

  },
);
