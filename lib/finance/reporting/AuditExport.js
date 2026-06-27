/**
 * AUDIT EXPORT ENGINE
 * Produces accountant-ready export pack
 */

export function generateAuditExport({
  journalEntries = [],
  auditLogs = []
}) {
  return {
    journal_entries: journalEntries,
    audit_trail: auditLogs,
    exported_at: Date.now()
  };
}
