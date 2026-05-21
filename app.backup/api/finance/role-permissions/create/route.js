import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

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
      .insert([
        {
          role:
            body.role,

          module:
            body.module,

          action:
            body.action,
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
        error:
          error.message,
      },
      {
        status: 500,
      }
    )
  }
}
