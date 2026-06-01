export const dynamic = 'force-dynamic'

import { NextResponse }
from 'next/server'

import {
  calculateFinancialHealth,
} from '@/lib/finance/shared/financialEngine'

import {
  getFinanceSummary,
} from '@/lib/finance/services/getFinanceSummary'

import {
  requireOrganizationAccess,
} from '@/lib/platform/security/requireOrganizationAccess'

export async function GET(req) {

  try {

    const organizationId =
      req.nextUrl.searchParams.get(
        'organizationId'
      )

    const access =
      await requireOrganizationAccess({

        organizationId,

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

    const summary =
      await getFinanceSummary({

        tenantId,

        organizationId,

      })

    const financials =
      calculateFinancialHealth({

        revenue:
          summary.revenue || 0,

        cost:
          summary.cost || 0,

        payroll: 0,

        pendingInvoices: 0,

        cashBalance:
          (summary.revenue || 0) -
          (summary.cost || 0),

      })

    return NextResponse.json({

      success: true,

      metrics: {

        revenue:
          summary.revenue || 0,

        cost:
          summary.cost || 0,

        payroll: 0,

        pendingInvoices: 0,

        profit:
          summary.profit || 0,

        costPercent:
          summary.costPercent || 0,

      },

      lowStock:
        summary.lowStock || [],

      alerts: [
        ...(summary.alerts || []),
        ...(financials.alerts || []),
      ],

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
