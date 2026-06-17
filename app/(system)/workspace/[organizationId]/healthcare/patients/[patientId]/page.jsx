"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function PatientProfilePage() {
  const params = useParams();

  const [patient, setPatient] =
    useState(null);

  useEffect(() => {
    async function load() {
      const response =
        await fetch(
          `/api/healthcare/patients/${params.patientId}`
        );

      const result =
        await response.json();

      setPatient(result.data);
    }

    load();
  }, [params.patientId]);

  if (!patient) {
    return (
      <main className="p-8">
        Loading...
      </main>
    );
  }

  return (
    <main className="p-8">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="mb-6 text-4xl font-bold">
          {patient.first_name}{" "}
          {patient.last_name}
        </h1>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="text-sm text-zinc-400">
              Date of Birth
            </div>

            <div>
              {patient.date_of_birth}
            </div>
          </div>

          <div>
            <div className="text-sm text-zinc-400">
              Phone
            </div>

            <div>
              {patient.phone}
            </div>
          </div>

          <div>
            <div className="text-sm text-zinc-400">
              Email
            </div>

            <div>
              {patient.email}
            </div>
          </div>

          <div>
            <div className="text-sm text-zinc-400">
              Blood Type
            </div>

            <div>
              {patient.blood_type}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
