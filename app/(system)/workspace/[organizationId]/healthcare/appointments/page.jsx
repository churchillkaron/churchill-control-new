"use client";
import { useAppointments } from "../hooks/useAppointments";
import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function AppointmentsPage() {
  const { organization } = useOrganization();
  const { appointments, loading, refresh } = useAppointments(organization?.id);

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">Appointments</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul className="space-y-2">
          {appointments.map(a => (
            <li key={a.id} className="border p-4 rounded">
              {a.appointment_datetime} - {a.patient_id} - {a.status}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
