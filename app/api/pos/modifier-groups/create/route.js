import { NextResponse } from 'next/server'

import {
  requireAuth,
} from '@/lib/shared/auth'

import {
  requireOrganizationAccess,
} from '@/lib/platform/security/requireOrganizationAccess'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

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

    const tenant_id =
      access.tenantId

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('modifier_groups')
      .insert([
        {
          tenant_id:
            tenant_id,

          name:
            body.name,

          required:
            body.required,

          multi_select:
            body.multi_select,

          max_select:
            body.max_select,
        },
      ])
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      data,
    })

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    )
  }
}
