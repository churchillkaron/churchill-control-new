import BaseLookupProvider from "../BaseLookupProvider";
import { CostCenterRepository } from "@/lib/finance/cost-centers/repositories/CostCenterRepository";

class CostCenterLookup extends BaseLookupProvider {
  async getOptions({ context }) {
    const rows = await CostCenterRepository.list({
      organizationId: context.organizationId,
      entityId: context.entityId || null,
    });

    return rows.map(row => ({
      value: row.id,
      label: row.name || row.code || "Unnamed Cost Center",
      code: row.code || "",
      description: row.description || "",
      raw: row,
    }));
  }
}

export default new CostCenterLookup();
