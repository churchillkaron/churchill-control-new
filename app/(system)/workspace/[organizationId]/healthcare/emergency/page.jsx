"use client";

import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function EmergencyPage() {
  const { organization } = useOrganization();

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          Emergency Department
        </h1>

        <p className="text-zinc-400">
          {organization?.name}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
          <div className="text-sm text-zinc-400">
            Waiting
          </div>

          <div className="mt-2 text-4xl font-bold">
            0
          </div>
        </div>

        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-6">
          <div className="text-sm text-zinc-400">
            Triage
          </div>

          <div className="mt-2 text-4xl font-bold">
            0
          </div>
        </div>

        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
          <div className="text-sm text-zinc-400">
            Treatment
          </div>

          <div className="mt-2 text-4xl font-bold">
            0
          </div>
        </div>

        <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-6">
          <div className="text-sm text-zinc-400">
            Discharged
          </div>

          <div className="mt-2 text-4xl font-bold">
            0
          </div>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="p-4 text-left">
                Patient
              </th>

              <th className="p-4 text-left">
                Severity
              </th>

              <th className="p-4 text-left">
                Arrival
              </th>

              <th className="p-4 text-left">
                Status
              </th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td className="p-4">
                No emergency cases
              </td>

              <td className="p-4">
                -
              </td>

              <td className="p-4">
                -
              </td>

              <td className="p-4">
                -
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
