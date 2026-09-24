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

      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-[#FBF8F3]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-black/[0.08]">
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
                    className="border-b border-black/[0.06]"
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
