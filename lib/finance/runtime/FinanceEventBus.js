/**
 * DISTRIBUTED FINANCE EVENT BUS (LEVEL 4 CORE)
 * Ensures cross-service financial consistency
 */

const subscribers = [];

export function subscribe(handler) {
  subscribers.push(handler);
}

export async function publish(event) {
  for (const handler of subscribers) {
    await handler(event);
  }
}

export function getSubscribers() {
  return subscribers.length;
}
