import '@/lib/restaurant/events/registerRestaurantEvents'

import '@/lib/restaurant/workflows/register/registerRestaurantWorkflows'

import '@/lib/signals/registerSignalWorkflows'

import '@/lib/procurement/events/registerProcurementEvents'

import '@/lib/approval/events/registerApprovalEvents'
let initialized = false

export function registerSystemEvents() {

  if (initialized) {
    return
  }

  initialized = true

  console.log(
    'Avantiqo enterprise runtime initialized'
  )
}
