"use client";
import { useAdmissions } from "../hooks/useAdmissions";
import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function AdmissionsPage() {
  const { organization } = useOrganization();
  const { admissions, loading, refresh } = useAdmissions(organization?.id);

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">Admissions</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul className="space-y-2">
          {admissions.map(a => (
            <li key={a.id} className="border p-4 rounded">
              {a.admission_date} - {a.patient_id} - {a.status}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
