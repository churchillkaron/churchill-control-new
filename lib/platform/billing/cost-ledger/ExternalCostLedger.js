/**
 * minimal ledger used by UBTE
 * records real external provider cost only
 */

const costs = [];

export function recordExternalCost(entry) {
  costs.push(entry);
}

export function getCosts() {
  return costs;
}
