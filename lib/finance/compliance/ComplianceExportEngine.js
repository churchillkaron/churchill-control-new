/**
 * COMPLIANCE EXPORT ENGINE
 * Accounting-firm / auditor-ready export layer
 */

import { getAuditLogs } from "../audit/AuditLedger";

export function generateCompliancePack({
  periodId,
  journalEntries = [],
  glEntries = [],
  taxReports = [],
  entityId
}) {
  return {
    periodId,
    entityId,

    // 🧾 CORE LEDGERS
    journal_entries: journalEntries,
    general_ledger: glEntries,

    // 🔒 AUDIT TRAIL (IMMUTABLE SOURCE OF TRUTH)
    audit_logs: getAuditLogs(),

    // 🌍 TAX SUBMISSION DATA
    tax_reports: taxReports,

    // 📦 META
    generated_at: Date.now(),

    integrity: {
      journal_count: journalEntries.length,
      gl_count: glEntries.length,
      audit_count: getAuditLogs().length
    }
  };
}
