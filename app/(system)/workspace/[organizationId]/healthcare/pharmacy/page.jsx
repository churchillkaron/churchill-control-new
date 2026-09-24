"use client";

import { useOrganization } from "@/app/providers/OrganizationProvider";
import { usePharmacy } from "../hooks/usePharmacy";

export default function PharmacyPage() {
  const { organization } = useOrganization();

  const {
    inventory,
    loading,
  } = usePharmacy(
    organization?.id
  );

  return (
    <main className="p-6">
      <h1 className="mb-6 text-3xl font-bold">
        Pharmacy Inventory
      </h1>

      <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-black/[0.07]">
              <th className="p-4 text-left">
                Medication
              </th>

              <th className="p-4 text-left">
                Quantity
              </th>

              <th className="p-4 text-left">
                Unit
              </th>

              <th className="p-4 text-left">
                Expiry
              </th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan="4" className="p-6">
                  Loading...
                </td>
              </tr>
            )}

            {!loading &&
              inventory.map(
                (item) => (
                  <tr
                    key={item.id}
                    className="border-b border-black/[0.05]"
                  >
                    <td className="p-4">
                      {item.medication_name}
                    </td>

                    <td className="p-4">
                      {item.quantity}
                    </td>

                    <td className="p-4">
                      {item.unit}
                    </td>

                    <td className="p-4">
                      {item.expiry_date}
                    </td>
                  </tr>
                )
              )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
