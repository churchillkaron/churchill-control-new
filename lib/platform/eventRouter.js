
/**
 * GLOBAL EVENT ROUTER
 * Routes events across organizations safely
 */

import { emitEvent } from "@/lib/pos/core/posEventEngine";

export function routeEvent(orgScope, event) {

  // attach organization context
  const enrichedEvent = {
    ...event,
    organization_id: orgScope.organizationId
  };

  // route internally
  emitEvent("GLOBAL", enrichedEvent);

}

