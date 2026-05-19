import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { checkFinancePermission } from '@/lib/finance/permissions/checkFinancePermission'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'finance_role_permissions'
      )
      .select('*')
      .eq(
        'role',
        body.role
      )

    if (error) {
      throw error
    }

    const result =
      checkFinancePermission({
        permissions:
          data || [],

        module:
          body.module,

        action:
          body.action,
      })

    return NextResponse.json({
      success: true,
      result,
    })

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    )
  }
}
