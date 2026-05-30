import {
  createSafeRealtimeChannel,
  removeSafeRealtimeChannel,
} from '@/lib/shared/realtime/createSafeRealtimeChannel'

export function createEnterpriseRealtime({

  name,

  subscriptions = [],

  onChange,

}) {

  const channel =
    createSafeRealtimeChannel({

      name,

      subscriptions,

      onChange,

    })

  return {

    channel,

    unsubscribe() {

      removeSafeRealtimeChannel(
        channel
      )

    },

  }

}
