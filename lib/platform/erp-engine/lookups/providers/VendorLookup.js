import BaseLookupProvider from "../BaseLookupProvider";
import { VendorRepository } from "@/lib/finance/vendors/repositories/VendorRepository";

class VendorLookup extends BaseLookupProvider {
  async getOptions({ context }) {
    const rows = await VendorRepository.list({
      organizationId: context.organizationId,
    });

    return rows.map(row => {
      const party = Array.isArray(row.parties)
        ? row.parties[0]
        : row.parties;

      const name =
        row.vendor_name ||
        row.name ||
        row.legal_name ||
        party?.display_name ||
        party?.legal_name ||
        "Unnamed Vendor";

      return {
        value: row.id,
        label: name,
        code: row.vendor_code || row.code || "",
        description:
          row.vendor_email ||
          row.email ||
          party?.email ||
          "",
        raw: row,
      };
    });
  }
}

export default new VendorLookup();
