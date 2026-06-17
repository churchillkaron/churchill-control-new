"use client";

import { useOrganization } from "@/app/providers/OrganizationProvider";
import { useWards } from "../hooks/useWards";

export default function WardsPage() {
  const { organization } = useOrganization();

  const {
    wards,
    loading,
  } = useWards(
    organization?.id
  );

  return (
    <main className="p-6">
      <h1 className="mb-6 text-3xl font-bold">
        Wards
      </h1>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="p-4 text-left">
                Code
              </th>

              <th className="p-4 text-left">
                Name
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
              wards.map(
                (ward) => (
                  <tr
                    key={ward.id}
                    className="border-b border-white/5"
                  >
                    <td className="p-4">
                      {ward.department_code}
                    </td>

                    <td className="p-4">
                      {ward.department_name}
                    </td>

                    <td className="p-4">
                      {ward.status}
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
