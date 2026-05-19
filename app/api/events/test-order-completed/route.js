export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  emitEvent,
} from '@/lib/shared/events/eventBus'

import {
  EVENTS,
} from '@/lib/shared/events/events'

import {
  registerSystemEvents,
} from '@/lib/shared/bootstrap/registerSystemEvents'

registerSystemEvents()

export async function POST() {

  try {

    const results =
      await emitEvent(

        EVENTS.ORDER_COMPLETED,

        {
          orderId:
            'TEST-ORDER-001',

          tenantId:
            'TEST-TENANT',

          items: [

            {
              dish:
                'Burger',

              quantity: 2,
            },

          ],
        }
      )

    return NextResponse.json({

      success: true,

      results,

    })

  } catch (error) {

    console.error(error)

    return NextResponse.json(
      {
        error:
          'Internal server error',
      },
      {
        status: 500,
      }
    )
  }
}
