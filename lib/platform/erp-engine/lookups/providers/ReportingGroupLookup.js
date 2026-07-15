import BaseLookupProvider from "../BaseLookupProvider";
import { ReportingGroupRepository } from "@/lib/finance/reporting-groups/repositories/ReportingGroupRepository";

class ReportingGroupLookup extends BaseLookupProvider {
  async getOptions({ context }) {
    const rows = await ReportingGroupRepository.list({
      organizationId: context.organizationId,
      entityId: context.entityId || null,
    });

    return rows.map(row => ({
      value: row.id,
      label: row.name || row.code || "Unnamed Reporting Group",
      code: row.code || "",
      description: row.description || "",
      raw: row,
    }));
  }
}

export default new ReportingGroupLookup();
