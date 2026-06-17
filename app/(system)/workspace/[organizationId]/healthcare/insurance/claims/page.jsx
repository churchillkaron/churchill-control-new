"use client";

import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function InsuranceClaimsPage() {
  const { organization } = useOrganization();

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Insurance Claims</h1>

      <p className="text-zinc-400 mb-6">
        Organization: {organization?.name}
      </p>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="p-4 text-left">Claim</th>
              <th className="p-4 text-left">Patient</th>
              <th className="p-4 text-left">Provider</th>
              <th className="p-4 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-4">No claims</td>
              <td className="p-4">-</td>
              <td className="p-4">-</td>
              <td className="p-4">-</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
