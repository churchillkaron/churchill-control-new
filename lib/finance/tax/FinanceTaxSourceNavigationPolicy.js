import { getWorkspaceItemByRoute } from "@/lib/platform/registry/erpRegistry";

export const FINANCE_TAX_SOURCE_NAVIGATION_CONTRACT = "FINANCE_TAX_SOURCE_NAVIGATION_V1";

const SOURCE_ROUTE_CANDIDATES = Object.freeze({
  customer_invoices: ["/finance/customer-invoices", "/finance/ar/invoices"],
  vendor_invoices: ["/finance/ap"],
  journal_entries: ["/finance/general-ledger", "/finance/journal-entries", "/finance/journals", "/finance/gl"],
  tax_rules: ["/finance/tax-codes"],
});

function text(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

function registeredRoute(candidates = []) {
  for (const route of candidates) {
    if (getWorkspaceItemByRoute(route)) return route;
  }
  return null;
}

function safeReturnPath(value, organizationId) {
  const path = text(value, 1200);
  const prefix = `/workspace/${organizationId}/finance`;
  if (!path || !path.startsWith(prefix)) return prefix;
  return path;
}

export function buildFinanceTaxSourceNavigation({
  organizationId,
  entityId,
  vatReturnId,
  target,
  returnPath,
} = {}) {
  const organization = text(organizationId, 120);
  const entity = text(entityId, 120);
  const filing = text(vatReturnId, 120);
  const workspace = text(target?.workspace, 120);
  const recordId = text(target?.record_id, 240);

  if (!organization || !entity || !filing || !workspace || !recordId) return null;
  if (target?.context_mutation_allowed !== false) return null;

  const route = registeredRoute(SOURCE_ROUTE_CANDIDATES[workspace] || []);
  if (!route) return null;

  const params = new URLSearchParams();
  params.set("focusRecordId", recordId);
  params.set("focusEntityId", entity);
  params.set("source", "tax-evidence");
  params.set("returnVatReturnId", filing);
  params.set("returnTo", safeReturnPath(returnPath, organization));

  return {
    contract: FINANCE_TAX_SOURCE_NAVIGATION_CONTRACT,
    workspace,
    route,
    record_id: recordId,
    entity_id: entity,
    vat_return_id: filing,
    href: `/workspace/${organization}${route}?${params.toString()}`,
    context_mutation_allowed: false,
    exact_record_focus: true,
  };
}

export function getFinanceTaxSourceRouteCandidates() {
  return SOURCE_ROUTE_CANDIDATES;
}
