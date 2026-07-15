const HANDLERS = {};

export function registerEventHandler(
  event,
  handler,
) {

  if (!event || !handler) {
    return;
  }

  if (!HANDLERS[event]) {
    HANDLERS[event] = [];
  }

  HANDLERS[event].push(handler);

}


export async function routeEvent(
  orgScope,
  event,
) {

  const enrichedEvent = {
    ...event,
    organization_id:
      orgScope.organizationId,
  };

  const handlers =
    HANDLERS[event.type] || [];

  for (const handler of handlers) {

    await handler(
      enrichedEvent
    );

  }

}
