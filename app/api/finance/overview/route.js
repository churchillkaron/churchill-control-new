export const dynamic = 'force-dynamic'

import { NextResponse }
from 'next/server'

import {
  calculateFinancialHealth,
} from '@/lib/shared/finance/financialEngine'

import {
  createServerSupabase,
} from '@/lib/shared/supabase/server'

export async function GET(req) {

  try {

    const supabase =
      createServerSupabase()

    const tenantId =
      req.nextUrl.searchParams.get(
        'tenantId'
      )

    if (!tenantId) {

      return NextResponse.json(

        {
          error:
            'tenantId required',
        },

        {
          status: 400,
        }

      )

    }

    const [

      salesResponse,

      payrollResponse,

      invoiceResponse,

    ] = await Promise.all([

      supabase
        .from('daily_sales_items')
        .select('*')
        .eq(
          'tenant_id',
          tenantId
        ),

      supabase
        .from('staff_salary_records')
        .select('*')
        .eq(
          'tenant_id',
          tenantId
        ),

      supabase
        .from('vendor_invoices')
        .select('*')
        .eq(
          'tenant_id',
          tenantId
        ),

    ])

    const sales =
      salesResponse.data || []

    const payrollRecords =
      payrollResponse.data || []

    const invoices =
      invoiceResponse.data || []

    const revenue =
      sales.reduce(

        (sum, row) =>

          sum +

          (
            Number(row.price || 0) *
            Number(row.quantity || 1)
          ),

        0

      )

    const cost =
      sales.reduce(

        (sum, row) =>

          sum +
          Number(row.cost || 0),

        0

      )

    const payroll =
      payrollRecords.reduce(

        (sum, row) =>

          sum +

          Number(
            row.final_salary || 0
          ),

        0

      )

    const pendingInvoices =
      invoices.filter(

        invoice =>
          invoice.status !== 'paid'

      ).length

    const financials =
      calculateFinancialHealth({

        revenue,

        cost,

        payroll,

        pendingInvoices,

        cashBalance:
          revenue -
          cost -
          payroll,

      })

    return NextResponse.json({

      success: true,

      metrics: {

        revenue,

        cost,

        payroll,

        pendingInvoices,

      },

      financials,

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
