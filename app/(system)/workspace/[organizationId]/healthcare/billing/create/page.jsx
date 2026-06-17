"use client";

import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function CreateBillingPage() {
  const { organization } = useOrganization();

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Create Invoice</h1>

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
          type="number"
          placeholder="Amount"
          className="w-full rounded border p-3"
        />

        <textarea
          placeholder="Invoice Description"
          rows="4"
          className="w-full rounded border p-3"
        />

        <button
          type="submit"
          className="rounded bg-blue-600 px-5 py-3 text-white"
        >
          Create Invoice
        </button>
      </form>
    </main>
  );
}
