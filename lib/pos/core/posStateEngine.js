import { loadPOSState } from "./loadPOSState";

/**
 * POS STATE ENGINE
 * Single controlled state source for POS UI
 */

export class POSStateEngine {

  constructor(tenantId) {
    this.tenantId = tenantId;
    this.state = {
      orders: [],
      items: {}
    };
    this.listeners = [];
  }

  async init() {
    await this.refresh();
  }

  async refresh() {
    const data = await loadPOSState(this.tenantId);

    this.state = data;

    this.emit();
  }

  getState() {
    return this.state;
  }

  subscribe(callback) {
    this.listeners.push(callback);

    callback(this.state);

    return () => {
      this.listeners =
        this.listeners.filter(l => l !== callback);
    };
  }

  emit() {
    for (const cb of this.listeners) {
      cb(this.state);
    }
  }

  // safe patch for realtime updates
  patchOrder(orderId, updater) {

    const order = this.state.orders.find(o => o.id === orderId);

    if (!order) return;

    Object.assign(order, updater(order));

    this.emit();
  }

}

import { mergeOrderState, mergeOrderItems } from "./posMergeEngine";
