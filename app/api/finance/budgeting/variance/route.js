import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { calculateBudgetVariance } from '@/lib/finance/budgeting/calculateBudgetVariance'

export async function GET() {

  try {

    const {
      data: budgets,
    } = await supabaseAdmin
      .from(
        'finance_budgets'
      )
      .select('*')

    const {
      data: actuals,
    } = await supabaseAdmin
      .from(
        'finance_actuals'
      )
      .select('*')

    const variance =
      calculateBudgetVariance({
        budgets:
          budgets || [],

        actuals:
          actuals || [],
      })

    return NextResponse.json({
      success: true,
      variance,
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
