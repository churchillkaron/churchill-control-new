import BaseLookupProvider from "../BaseLookupProvider";
import { EmployeeRepository } from "@/lib/workforce/employees/repositories/EmployeeRepository";

class EmployeeLookup extends BaseLookupProvider {
  async getOptions({ context }) {
    const rows = await EmployeeRepository.list({
      organizationId: context.organizationId,
    });

    return rows.map(row => ({
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
