export async function
detectEnterpriseSignals({

  event,

  payload,

}) {

  const signals = []

  // ===== LOW INVENTORY =====
  if (
    payload.inventory &&
    payload.inventory.remaining <= 10
  ) {

    signals.push({

      signal:
        'LOW_INVENTORY',

      payload,

    })

  }

  // ===== HIGH SALES =====
  if (
    payload.total >
    10000
  ) {

    signals.push({

      signal:
        'HIGH_VALUE_ORDER',

      payload,

    })

  }

  // ===== WORKFLOW FAILURE =====
  if (
    payload.workflowFailed
  ) {

    signals.push({

      signal:
        'WORKFLOW_FAILED',

      payload,

    })

  }

  return signals

}
