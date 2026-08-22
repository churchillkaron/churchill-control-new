import { getFinanceFixedAssetFormContract } from "@/lib/platform/forms/FinanceFixedAssetFormContract";

export function resolveRowAction({
  action,
  row,
  organizationId,
  entityId,
}) {
  const endpoint = action?.endpoint || action?.api || action?.url || null;
  if (!endpoint) return null;

  const payload = {
    provider_id: row?.provider_id || row?.id || null,
    organization_id: organizationId,
    entity_id: entityId || row?.entity_id || null,
  };

  if (endpoint === "/api/finance/fixed-assets/update") {
    return {
      endpoint,
      method: action?.method || "POST",
      schema: getFinanceFixedAssetFormContract("fixed-asset") || [],
      payload,
      title: action?.title || action?.label || "Edit Fixed Asset",
    };
  }

  return {
    endpoint,
    method: action?.method || "POST",
    payload,
  };
}
