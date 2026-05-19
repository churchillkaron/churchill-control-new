import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildCustomerDisplay } from '@/lib/pos/customer-display/buildCustomerDisplay'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const payload =
      buildCustomerDisplay(body)

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('pos_customer_displays')
      .upsert([
        {
          tenant_id:
            body.tenant_id,
          terminal_id:
            body.terminal_id,
          payload,
          updated_at:
            new Date()
              .toISOString(),
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
