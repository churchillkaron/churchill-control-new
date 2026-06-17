"use client";
import { useMedicalRecords } from "../hooks/useMedicalRecords";
import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function MedicalRecordsPage() {
  const { organization } = useOrganization();
  const { medicalRecords, loading, refresh } = useMedicalRecords(organization?.id);

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">Medical Records</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul className="space-y-2">
          {medicalRecords.map(r => (
            <li key={r.id} className="border p-4 rounded">
              {r.visit_date} - {r.patient_id} - {r.diagnosis}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
