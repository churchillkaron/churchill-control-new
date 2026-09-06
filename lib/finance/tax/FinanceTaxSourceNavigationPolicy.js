import { getWorkspaceItemByRoute } from "@/lib/platform/registry/erpRegistry";

export const FINANCE_TAX_SOURCE_NAVIGATION_CONTRACT = "FINANCE_TAX_SOURCE_NAVIGATION_V2";

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
  const path = text(value, 1600);
  const prefix = `/workspace/${organizationId}/finance`;
  if (!path || !path.startsWith(prefix)) return prefix;
  return path;
}

function taxEvidenceReturnPath({ organizationId, entityId, vatReturnId, dependencyCode }) {
  const params = new URLSearchParams();
  params.set("vatReturnId", vatReturnId);
  params.set("focusEntityId", entityId);
  params.set("stage", "EVIDENCE");
  if (dependencyCode) params.set("dependencyCode", dependencyCode);
  params.set("source", "tax-source-return");
  return `/workspace/${organizationId}/finance/tax?${params.toString()}`;
}

export function buildFinanceTaxSourceNavigation({
  organizationId,
  entityId,
  vatReturnId,
  dependencyCode = null,
  target,
  returnPath,
} = {}) {
  const organization = text(organizationId, 120);
  const entity = text(entityId, 120);
  const filing = text(vatReturnId, 120);
  const dependency = text(dependencyCode, 120).toUpperCase();
  const workspace = text(target?.workspace, 120);
  const recordId = text(target?.record_id, 240);

  if (!organization || !entity || !filing || !workspace || !recordId) return null;
  if (target?.context_mutation_allowed !== false) return null;

  const route = registeredRoute(SOURCE_ROUTE_CANDIDATES[workspace] || []);
  if (!route) return null;

  const defaultReturnPath = taxEvidenceReturnPath({
    organizationId: organization,
    entityId: entity,
    vatReturnId: filing,
    dependencyCode: dependency,
  });
  const requestedReturn = text(returnPath, 1600);
  const financeRoot = `/workspace/${organization}/finance`;
  const effectiveReturn = !requestedReturn || requestedReturn === financeRoot
    ? defaultReturnPath
    : safeReturnPath(requestedReturn, organization);

  const params = new URLSearchParams();
  params.set("focusRecordId", recordId);
  params.set("focusEntityId", entity);
  params.set("source", "tax-evidence");
  params.set("returnVatReturnId", filing);
  if (dependency) params.set("returnDependencyCode", dependency);
  params.set("returnTo", effectiveReturn);

  return {
    contract: FINANCE_TAX_SOURCE_NAVIGATION_CONTRACT,
    workspace,
    route,
    record_id: recordId,
    entity_id: entity,
    vat_return_id: filing,
    dependency_code: dependency || null,
    href: `/workspace/${organization}${route}?${params.toString()}`,
    return_href: effectiveReturn,
    context_mutation_allowed: false,
    exact_record_focus: true,
  };
}

export function getFinanceTaxSourceRouteCandidates() {
  return SOURCE_ROUTE_CANDIDATES;
}
