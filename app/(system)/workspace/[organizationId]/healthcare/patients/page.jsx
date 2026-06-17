"use client";

import { useState } from "react";
import Link from "next/link";
import { useOrganization } from "@/app/providers/OrganizationProvider";
import { usePatients } from "../hooks/usePatients";

export default function PatientsPage() {
  const { organization } = useOrganization();

  const {
    patients,
    loading,
    refresh,
  } = usePatients(
    organization?.id
  );

  const [deletingId, setDeletingId] =
    useState(null);

  async function handleDelete(id) {
    if (
      !confirm(
        "Delete this patient?"
      )
    ) {
      return;
    }

    setDeletingId(id);

    await fetch(
      `/api/healthcare/patients/${id}`,
      {
        method: "DELETE",
      }
    );

    await refresh();

    setDeletingId(null);
  }

  return (
    <main className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">
            Patients
          </h1>

          <p className="mt-2 text-zinc-400">
            Patient management
          </p>
        </div>

        <Link
          href={`/workspace/${organization?.id}/healthcare/patients/create`}
          className="rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white"
        >
          Add Patient
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="p-5 text-left">
                Name
              </th>

              <th className="p-5 text-left">
                Date of Birth
              </th>

              <th className="p-5 text-left">
                Phone
              </th>

              <th className="p-5 text-left">
                Email
              </th>

              <th className="p-5 text-right">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan="5"
                  className="p-8"
                >
                  Loading...
                </td>
              </tr>
            )}

            {!loading &&
              patients.map(
                (patient) => (
                  <tr
                    key={patient.id}
                    className="border-b border-white/5"
                  >
                    <td className="p-5">
                      <div className="font-medium">
                        {patient.first_name}{" "}
                        {patient.last_name}
                      </div>
                    </td>

                    <td className="p-5">
                      {patient.date_of_birth}
                    </td>

                    <td className="p-5">
                      {patient.phone}
                    </td>

                    <td className="p-5">
                      {patient.email}
                    </td>

                    <td className="p-5">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/workspace/${organization?.id}/healthcare/patients/${patient.id}`}
                          className="rounded-xl border border-white/10 px-3 py-2"
                        >
                          View
                        </Link>

                        <Link
                          href={`/workspace/${organization?.id}/healthcare/patients/${patient.id}/edit`}
                          className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2"
                        >
                          Edit
                        </Link>

                        <button
                          onClick={() =>
                            handleDelete(
                              patient.id
                            )
                          }
                          disabled={
                            deletingId ===
                            patient.id
                          }
                          className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2"
                        >
                          {deletingId ===
                          patient.id
                            ? "..."
                            : "Delete"}
                        </button>
                      </div>
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
