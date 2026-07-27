import BaseLookupProvider from "../BaseLookupProvider";
import { VendorRepository } from "@/lib/finance/vendors/repositories/VendorRepository";

class VendorLookup extends BaseLookupProvider {
  async getOptions({ context }) {
    const rows = await VendorRepository.list({
      organizationId: context.organizationId,
    });

    return rows
      .map(row => {
        const party = Array.isArray(row.parties)
          ? row.parties[0]
          : row.parties;
        const partyId =
          row.party_id ||
          row.vendor_party_id ||
          party?.id ||
          null;

        if (!partyId) {
          return null;
        }

        const name =
          row.vendor_name ||
          row.name ||
          row.legal_name ||
          party?.display_name ||
          party?.legal_name ||
          "Unnamed Vendor";

        return {
          value: partyId,
          label: name,
          code: row.vendor_code || row.code || "",
          description:
            row.vendor_email ||
            row.email ||
            party?.email ||
            "",
          raw: {
            ...row,
            vendor_party_id: partyId,
          },
        };
      })
      .filter(Boolean);
  }
}

export default new VendorLookup();
