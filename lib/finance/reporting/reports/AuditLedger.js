/**
 * AUDIT LEDGER (APPEND-ONLY STORAGE LAYER)
 * Accounting firm compliance backbone
 */

const auditStore = []; // replace with DB table in production

export function appendAuditLog(log) {
  auditStore.push(Object.freeze({
    ...log,
    id: `${Date.now()}-${Math.random()}`,
    created_at: Date.now()
  }));
}

export function getAuditLogs() {
  return auditStore;
}
