import {
  getExecutiveKPIs,
} from "@/lib/finance/reporting/reports/getExecutiveKPIs";

export async function runExecutiveKPIs(input = {}) {
  const organizationId =
    input.organizationId ||
    input.organization_id ||
    input.tenantId ||
    input.tenant_id;

  return getExecutiveKPIs({
    ...input,
    organizationId,
    organization_id: organizationId,
  });
}
