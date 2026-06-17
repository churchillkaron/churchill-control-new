/**
 * POS REALTIME MERGE ENGINE
 * Prevents duplicate loads + state overwrite
 */

export function mergeOrderState(currentState, incomingOrder) {

  const orders = [...currentState.orders];

  const index = orders.findIndex(o => o.id === incomingOrder.id);

  if (index === -1) {
    // new order
    orders.push(incomingOrder);
  } else {
    // merge update (NOT replace)
    orders[index] = {
      ...orders[index],
      ...incomingOrder
    };
  }

  return {
    ...currentState,
    orders
  };
}

export function mergeOrderItems(currentState, orderId, items) {

  const itemsMap = {
    ...currentState.items
  };

  itemsMap[orderId] = items;

  return {
    ...currentState,
    items: itemsMap
  };
}

import { nextState } from "./orderStateMachine";
