"use client";

import { useOrganization } from "@/app/providers/OrganizationProvider";
import { useBeds } from "../hooks/useBeds";

export default function BedsPage() {
  const { organization } = useOrganization();

  const {
    beds,
    loading,
  } = useBeds(
    organization?.id
  );

  return (
    <main className="p-6">
      <h1 className="mb-6 text-3xl font-bold">
        Beds
      </h1>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="p-4 text-left">
                Bed Number
              </th>

              <th className="p-4 text-left">
                Room
              </th>

              <th className="p-4 text-left">
                Status
              </th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan="3" className="p-6">
                  Loading...
                </td>
              </tr>
            )}

            {!loading &&
              beds.map(
                (bed) => (
                  <tr
                    key={bed.id}
                    className="border-b border-white/5"
                  >
                    <td className="p-4">
                      {bed.bed_number}
                    </td>

                    <td className="p-4">
                      {bed.room_id}
                    </td>

                    <td className="p-4">
                      {bed.status}
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
