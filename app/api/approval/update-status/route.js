import { NextResponse }
from 'next/server'

import {
  requireAuth,
} from '@/lib/shared/auth'

import {
  requireOrganizationAccess,
} from '@/lib/platform/security/requireOrganizationAccess'

import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

import {
  emitEvent,
} from '@/lib/shared/events/eventBus'

export async function POST(
  request
) {

  try {

    const body =
      await request.json()

    await requireAuth()

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId,

      })

    if (!access.success) {

      return NextResponse.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      )

    }

    const tenantId =
      access.tenantId

    const {
      id,
      status,
    } = body

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'approval_tasks'
      )
      .update({

        status,

      })
      .eq(
        'id',
        id
      )
      .eq(
        'tenant_id',
        tenantId
      )
      .select()
      .single()

    if (error) {

      console.error(
        '[APPROVAL_UPDATE_ERROR]',
        error
      )

      return NextResponse.json({

        success: false,

      }, {
        status: 500,
      })

    }

    // ===== ENTERPRISE EVENTS =====

    if (
      status === 'APPROVED'
    ) {

      await emitEvent(

        'APPROVAL_GRANTED',

        {

          tenantId:
            data.tenant_id,

          type:
            data.type,

          approval:
            data,

        }

      )

    }

    if (
      status === 'REJECTED'
    ) {

      await emitEvent(

        'APPROVAL_REJECTED',

        {

          tenantId:
            data.tenant_id,

          type:
            data.type,

          approval:
            data,

        }

      )

    }

    return NextResponse.json({

      success: true,

      data,

    })

  } catch (error) {

    console.error(
      '[APPROVAL_ROUTE_ERROR]',
      error
    )

    return NextResponse.json({

      success: false,

    }, {
      status: 500,
    })

  }

}
