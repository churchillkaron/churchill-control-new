import {
  EVENTS,
} from '@/lib/shared/events/events'

import {
  registerEvent,
} from '@/lib/shared/events/eventBus'

registerEvent(
  EVENTS.ORDER_COMPLETED,

  async payload => {

    console.log(
      'ORDER_COMPLETED workflow triggered',
      payload
    )

    /*
    |--------------------------------------------------------------------------
    | Future Flow
    |--------------------------------------------------------------------------
    |
    | 1. Deduct inventory
    | 2. Create production cost
    | 3. Create accounting journal
    | 4. Update KPIs
    | 5. Update intelligence
    | 6. Trigger forecasting update
    |
    */

    return {
      success: true,
    }
  }
)
