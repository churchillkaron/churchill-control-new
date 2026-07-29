import BaseLookupProvider from "../BaseLookupProvider";
import { EmployeeRepository } from "@/lib/workforce/employees/repositories/EmployeeRepository";

function isActive(row = {}) {
  if (row.is_active === false || row.active === false || row.enabled === false) {
    return false;
  }

  const status = String(row.status || "ACTIVE").trim().toUpperCase();
  return ![
    "INACTIVE",
    "DISABLED",
    "SUSPENDED",
    "TERMINATED",
    "ARCHIVED",
  ].includes(status);
}

class EmployeeLookup extends BaseLookupProvider {
  async getOptions({ context }) {
    const rows = await EmployeeRepository.list({
      organizationId: context.organizationId,
    });

    return rows
      .filter(isActive)
      .map(row => ({
        value: row.id,
        label:
          row.full_name ||
          row.name ||
          row.display_name ||
          row.email ||
          "Unnamed Employee",
        description:
          row.position ||
          row.job_title ||
          row.role ||
          row.email ||
          "",
        raw: row,
      }));
  }
}

export default new EmployeeLookup();
