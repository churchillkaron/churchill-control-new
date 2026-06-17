"use client";

import Link from "next/link";
import { useOrganization } from "@/app/providers/OrganizationProvider";
import { useStaff } from "../hooks/useStaff";

export default function StaffPage() {
  const { organization } = useOrganization();

  const {
    staff,
    loading,
  } = useStaff(
    organization?.id
  );

  return (
    <main className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          Staff
        </h1>

        <Link
          href={`/workspace/${organization?.id}/healthcare/staff/create`}
          className="rounded-xl bg-blue-600 px-4 py-2 text-white"
        >
          Add Staff
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="p-4 text-left">First Name</th>
              <th className="p-4 text-left">Last Name</th>
              <th className="p-4 text-left">Role</th>
              <th className="p-4 text-left">Specialization</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan="4" className="p-6">Loading...</td>
              </tr>
            )}

            {!loading &&
              staff.map((member) => (
                <tr key={member.id} className="border-b border-white/5">
                  <td className="p-4">{member.first_name}</td>
                  <td className="p-4">{member.last_name}</td>
                  <td className="p-4">{member.role}</td>
                  <td className="p-4">{member.specialization}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
