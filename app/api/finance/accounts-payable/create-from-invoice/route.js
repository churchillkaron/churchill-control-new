import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { createAccountsPayableEntry } from '@/lib/finance/accountsPayable/createAccountsPayableEntry'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      data: invoice,
      error,
    } = await supabaseAdmin
      .from(
        'production_supplier_invoices'
      )
      .select('*')
      .eq(
        'id',
        body.invoice_id
      )
      .single()

    if (error) {
      throw error
    }

    const result =
      await createAccountsPayableEntry({
        invoice,
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
