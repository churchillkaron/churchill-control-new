import {
  generateProfitAndLoss,
} from '@/lib/finance/statements/generateProfitAndLoss'

import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
loadExecutiveFinancials({

  tenantId,

}) {

  const pnl =
    await generateProfitAndLoss({

      tenantId,

    })

  const {
    data: approvals,
  } = await supabaseAdmin
    .from(
      'approval_tasks'
    )
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'status',
      'PENDING'
    )

  const {
    data: incidents,
  } = await supabaseAdmin
    .from(
      'incidents'
    )
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'status',
      'OPEN'
    )

  const {
    data: ap,
  } = await supabaseAdmin
    .from(
      'accounts_payable'
    )
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )

  const totalAP =
    (ap || []).reduce(

      (sum, row) =>

        sum +
        Number(
          row.total_amount || 0
        ),

      0

    )

  return {

    pnl,

    pendingApprovals:
      approvals?.length || 0,

    openIncidents:
      incidents?.length || 0,

    totalAccountsPayable:
      totalAP,

  }

}
