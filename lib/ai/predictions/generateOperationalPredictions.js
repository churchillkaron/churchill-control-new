export async function
generateOperationalPredictions({

  financials,

  workflowLogs,

  aiDecisions,

}) {

  const predictions = []

  // ===== LOW PROFIT =====

  if (
    Number(
      financials?.pnl?.netProfit || 0
    ) < 0
  ) {

    predictions.push({

      severity:
        'HIGH',

      type:
        'LOSS_RISK',

      recommendation:
        'Reduce operating expenses immediately',

    })

  }

  // ===== HIGH INCIDENTS =====

  const failedWorkflows =
    (workflowLogs || []).filter(

      log =>
        log.status ===
        'FAILED'

    )

  if (
    failedWorkflows.length >= 5
  ) {

    predictions.push({

      severity:
        'HIGH',

      type:
        'OPERATIONAL_RISK',

      recommendation:
        'Investigate workflow instability',

    })

  }

  // ===== AI OVERLOAD =====

  if (
    (aiDecisions || []).length > 50
  ) {

    predictions.push({

      severity:
        'MEDIUM',

      type:
        'AI_ACTIVITY_SPIKE',

      recommendation:
        'Review enterprise automation load',

    })

  }

  return predictions

}
