"use client";

import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function CreateStaffPage() {
  const { organization } = useOrganization();

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Add Staff Member</h1>
      <p className="text-zinc-400 mb-6">Organization: {organization?.name}</p>

      <form className="space-y-4">
        <input type="text" placeholder="First Name" className="w-full rounded border p-3" />
        <input type="text" placeholder="Last Name" className="w-full rounded border p-3" />
        <input type="text" placeholder="Role" className="w-full rounded border p-3" />
        <input type="text" placeholder="Specialization" className="w-full rounded border p-3" />
        <input type="text" placeholder="Department ID" className="w-full rounded border p-3" />
        <input type="text" placeholder="Phone" className="w-full rounded border p-3" />
        <input type="email" placeholder="Email" className="w-full rounded border p-3" />
        <button type="submit" className="rounded bg-blue-600 px-5 py-3 text-white">
          Add Staff
        </button>
      </form>
    </main>
  );
}
