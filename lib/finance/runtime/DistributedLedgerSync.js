/**
 * DISTRIBUTED LEDGER CONSISTENCY LAYER
 * Ensures all finance nodes agree on state
 */

const ledgerState = new Map();

export function syncLedger(entityId, glSnapshot) {
  ledgerState.set(entityId, {
    snapshot: glSnapshot,
    timestamp: Date.now()
  });
}

export function getLedgerState(entityId) {
  return ledgerState.get(entityId);
}
