/**
 * GLOBAL POS EVENT ENGINE
 * Single source of truth for UI updates across POS, Kitchen, Bar, Expo
 */

const subscribers = {
  POS: new Set(),
  KITCHEN: new Set(),
  BAR: new Set(),
  EXPO: new Set(),
  GLOBAL: new Set()
};

export const POS_EVENT_TYPES = {
  ORDER_UPDATED: "ORDER_UPDATED",
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_STATUS_CHANGED: "ORDER_STATUS_CHANGED",
  ITEM_UPDATED: "ITEM_UPDATED"
};

export function emitEvent(scope, event) {
  const targets = subscribers[scope] || [];

  targets.forEach(fn => fn(event));

  // also broadcast globally
  subscribers.GLOBAL.forEach(fn => fn(event));
}

export function subscribe(scope, fn) {
  if (!subscribers[scope]) {
    subscribers[scope] = new Set();
  }

  subscribers[scope].add(fn);

  return () => {
    subscribers[scope].delete(fn);
  };
}

import { supabase } from "@/lib/shared/supabase/client";

/**
 * PERSIST EVENT TO DATABASE (RELIABILITY LAYER)
 */
export async function persistEvent(event) {
  try {
    await supabase.from("pos_event_log").insert(event);
  } catch (err) {
    console.error("EVENT PERSIST FAILED", err);
  }
}


export async function emitAndPersist(scope, event) {
  await persistEvent({
    tenant_id: event.tenantId || null,
    event_type: event.type,
    scope,
    payload: event
  });

  emitEvent(scope, event);
}

