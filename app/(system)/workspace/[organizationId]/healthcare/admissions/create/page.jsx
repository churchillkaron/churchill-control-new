"use client";

import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function CreateAdmissionPage() {
  const { organization } = useOrganization();

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Create Admission</h1>
      <p className="text-zinc-400 mb-6">Organization: {organization?.name}</p>

      <form className="space-y-4">
        <input
          type="text"
          placeholder="Patient ID"
          className="w-full rounded border p-3"
        />
        <input
          type="text"
          placeholder="Attending Doctor ID"
          className="w-full rounded border p-3"
        />
        <input
          type="datetime-local"
          className="w-full rounded border p-3"
        />
        <textarea
          placeholder="Admission Reason"
          className="w-full rounded border p-3"
          rows="4"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-5 py-3 text-white"
        >
          Admit Patient
        </button>
      </form>
    </main>
  );
}
