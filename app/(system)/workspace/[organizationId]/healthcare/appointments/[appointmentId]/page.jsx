"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function AppointmentProfilePage() {
  const params = useParams();
  const [appointment, setAppointment] = useState(null);

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/healthcare/appointments/${params.appointmentId}`);
      const result = await response.json();
      setAppointment(result.data);
    }
    load();
  }, [params.appointmentId]);

  if (!appointment) {
    return <main className="p-8">Loading...</main>;
  }

  return (
    <main className="p-8">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="mb-6 text-4xl font-bold">
          Appointment Details
        </h1>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="text-sm text-zinc-400">Patient ID</div>
            <div>{appointment.patient_id}</div>
          </div>

          <div>
            <div className="text-sm text-zinc-400">Doctor ID</div>
            <div>{appointment.doctor_id}</div>
          </div>

          <div>
            <div className="text-sm text-zinc-400">Appointment Date</div>
            <div>{appointment.appointment_datetime}</div>
          </div>

          <div>
            <div className="text-sm text-zinc-400">Status</div>
            <div>{appointment.status}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
