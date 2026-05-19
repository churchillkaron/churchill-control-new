import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'finance_journal_lines'
      )
      .select('*')

    if (error) {
      throw error
    }

    const accounts = {}

    data.forEach(
      line => {

        if (
          !accounts[
            line.account_code
          ]
        ) {

          accounts[
            line.account_code
          ] = {

            account_code:
              line.account_code,

            account_name:
              line.account_name,

            debits: 0,

            credits: 0,
          }
        }

        if (
          line.type ===
          'DEBIT'
        ) {

          accounts[
            line.account_code
          ].debits +=
            Number(
              line.amount || 0
            )

        } else {

          accounts[
            line.account_code
          ].credits +=
            Number(
              line.amount || 0
            )
        }
      }
    )

    return NextResponse.json({
      success: true,
      trial_balance:
        Object.values(
          accounts
        ),
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
