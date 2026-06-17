import { createServerSupabase } from "@/lib/shared/supabase/server";
import {
  generateProfitAndLoss,
} from '@/lib/finance/statements/generateProfitAndLoss'

import { supabase }
from '@/lib/shared/supabase/client'

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
  } = await supabase
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
  } = await supabase
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
  } = await supabase
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
