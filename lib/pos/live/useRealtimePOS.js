"use client";

import { useEffect } from "react";

import createPOSSubscription from "@/lib/pos/subscriptions/createPOSSubscription";

export default function useRealtimePOS({
  tenant_id,
  onEvent,
}) {

  useEffect(() => {

    const result =
      createPOSSubscription({

        tenant_id,

        onInsert:
          onEvent,
      });

    return () => {

      if (
        result?.channel
      ) {

        result.channel.unsubscribe();
      }
    };

  }, [
    tenant_id,
    onEvent,
  ]);
}
