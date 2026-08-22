import { getForm } from "@/lib/platform/forms";

const FORM_BY_ENDPOINT = Object.freeze({
  "/api/finance/fixed-assets/update": "fixed-asset",
  "/api/finance/legal-entities/update": "legal-entity",
  "/api/finance/cost-centers/update": "cost-center",
  "/api/finance/bank-accounts/upsert": "bank-account",
});

function inferredEndpoint(action) {
  const label = String(action?.label || action?.title || "")
    .trim()
    .toLowerCase();

  if (label === "edit account") return "/api/finance/bank-accounts/upsert";
  if (label === "archive account") return "/api/finance/bank-accounts/archive";
  return null;
}

export function resolveRowAction({
  action,
  row,
  organizationId,
  entityId,
}) {
  const endpoint =
    action?.endpoint ||
    action?.api ||
    action?.url ||
    inferredEndpoint(action);
  if (!endpoint) return null;

  const payload = {
    provider_id: row?.provider_id || row?.id || null,
    organization_id: organizationId,
    entity_id: entityId || row?.entity_id || null,
  };

  const formId = FORM_BY_ENDPOINT[endpoint];
  if (formId) {
    return {
      endpoint,
      method: action?.method || "POST",
      schema: getForm(formId) || [],
      payload,
      title: action?.title || action?.label || "Edit Record",
    };
  }

  return {
    endpoint,
    method: action?.method || "POST",
    payload,
  };
}
