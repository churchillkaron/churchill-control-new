import { generateCompliancePack } from "./ComplianceExportEngine";

/**
 * FINANCE COMPLIANCE GATEWAY
 * Entry point for auditors / tax exports
 */

export async function financeComplianceGateway(payload) {
  const {
    periodId,
    journalEntries,
    glEntries,
    taxReports,
    entityId
  } = payload;

  return generateCompliancePack({
    periodId,
    journalEntries,
    glEntries,
    taxReports,
    entityId
  });
}
