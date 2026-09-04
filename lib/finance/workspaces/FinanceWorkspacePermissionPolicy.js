import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

const POLICY = Object.freeze({
  opening_balances: { read: "finance.accounting.view", write: "finance.accounting.manage" },
  recurring_journals: { read: "finance.accounting.view", write: "finance.accounting.manage" },
  collections: { read: "finance.receivables.view", write: "finance.receivables.manage" },
  customer_statements: { read: "finance.receivables.view", write: "finance.receivables.manage" },
  revenue_recognition: { read: "finance.accounting.view", write: "finance.accounting.manage" },
  vendor_statements: { read: "finance.payables.view", write: "finance.payables.manage" },
  cash_management: { read: "finance.banking.view", write: "finance.banking.manage" },
  cash_flow: { read: "finance.banking.view", write: "finance.banking.manage" },
  bank_statements: { read: "finance.banking.view", write: "finance.banking.manage" },
  bank_reconciliation: { read: "finance.banking.view", write: "finance.banking.manage" },
  fx_revaluation: { read: "finance.accounting.view", write: "finance.accounting.manage" },
  vat_returns: { read: "finance.tax.view", write: "finance.tax.manage" },
  depreciation: { read: "finance.accounting.view", write: "finance.accounting.manage" },
  statutory_filings: { read: "finance.tax.view", write: "finance.tax.manage" },
  report_builder: { read: "finance.reports.view", write: "finance.reports.manage" },
  scheduled_reports: { read: "finance.reports.view", write: "finance.reports.manage" },
  organization_profile: { read: "finance.accounting.view", write: "finance.configuration.manage" },
  accounting_settings: { read: "finance.accounting.view", write: "finance.configuration.manage" },
  number_sequences: { read: "finance.accounting.view", write: "finance.configuration.manage" },
  posting_rules: { read: "finance.accounting.view", write: "finance.configuration.manage" },
  approval_workflows: { read: "finance.accounting.view", write: "finance.configuration.manage" },
  government_connections: { read: "finance.tax.view", write: "finance.tax.manage" },
  banking_integrations: { read: "finance.banking.view", write: "finance.banking.manage" },
  exchange_rates: { read: "finance.accounting.view", write: "finance.accounting.manage" },
  e_invoicing: { read: "finance.tax.view", write: "finance.tax.manage" },
  document_templates: { read: "finance.accounting.view", write: "finance.configuration.manage" },
});

export function getFinanceWorkspacePermission(capabilityId, operation = "read") {
  const normalizedCapabilityId = String(capabilityId || "").trim();
  const normalizedOperation = operation === "write" ? "write" : "read";
  const policy = POLICY[normalizedCapabilityId];
  const permissionKey = policy?.[normalizedOperation] || null;

  if (!permissionKey) {
    throw new Error(
      `Permission denied: Finance workspace policy missing for ${normalizedCapabilityId || "unknown"}`
    );
  }

  return permissionKey;
}

export async function requireFinanceWorkspacePermission({
  capabilityId,
  operation = "read",
  access,
}) {
  if (!access?.success || !access.organizationId || !access.user?.id) {
    throw new Error("Permission denied: authenticated Finance access required");
  }

  const permissionKey = getFinanceWorkspacePermission(capabilityId, operation);

  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user.id,
    permissionKey,
    fullAccess: access.permissions?.includes("*") === true,
  });

  return permissionKey;
}
