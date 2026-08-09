import {
  getExecutiveKPIs,
} from "@/lib/finance/reporting/reports/getExecutiveKPIs";

export async function runExecutiveKPIs(input = {}) {
  const organizationId =
    input.organizationId ||
    input.organization_id ||
    null;

  if (!organizationId) {
    throw new Error("organizationId required");
  }

  return getExecutiveKPIs({
    ...input,
    organizationId,
    organization_id: organizationId,
  });
}
