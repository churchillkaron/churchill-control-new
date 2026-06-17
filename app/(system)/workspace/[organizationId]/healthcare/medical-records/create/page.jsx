"use client";

import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function CreateMedicalRecordPage() {
  const { organization } = useOrganization();

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Create Medical Record</h1>

      <p className="text-zinc-400 mb-6">
        Organization: {organization?.name}
      </p>

      <form className="space-y-4">
        <input
          type="text"
          placeholder="Patient ID"
          className="w-full rounded border p-3"
        />

        <input
          type="text"
          placeholder="Doctor ID"
          className="w-full rounded border p-3"
        />

        <input
          type="text"
          placeholder="Diagnosis"
          className="w-full rounded border p-3"
        />

        <textarea
          placeholder="Treatment Plan"
          rows="4"
          className="w-full rounded border p-3"
        />

        <textarea
          placeholder="Clinical Notes"
          rows="6"
          className="w-full rounded border p-3"
        />

        <button
          type="submit"
          className="rounded bg-blue-600 px-5 py-3 text-white"
        >
          Save Medical Record
        </button>
      </form>
    </main>
  );
}
