"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function EditAppointmentPage() {
  const params = useParams();
  const [form, setForm] = useState(null);

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/healthcare/appointments/${params.appointmentId}`);
      const result = await response.json();
      setForm(result.data);
    }
    load();
  }, [params.appointmentId]);

  async function save(e) {
    e.preventDefault();
    await fetch(`/api/healthcare/appointments/${params.appointmentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    alert("Saved");
  }

  if (!form) return <main className="p-8">Loading...</main>;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-4xl font-bold">Edit Appointment</h1>

      <form className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-8" onSubmit={save}>
        <input
          type="text"
          value={form.patient_id || ""}
          onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
          className="w-full rounded-xl border border-white/10 bg-transparent p-3"
        />

        <input
          type="text"
          value={form.doctor_id || ""}
          onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}
          className="w-full rounded-xl border border-white/10 bg-transparent p-3"
        />

        <input
          type="datetime-local"
          value={form.appointment_datetime || ""}
          onChange={(e) => setForm({ ...form, appointment_datetime: e.target.value })}
          className="w-full rounded-xl border border-white/10 bg-transparent p-3"
        />

        <select
          value={form.status || ""}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          className="w-full rounded-xl border border-white/10 bg-transparent p-3"
        >
          <option value="SCHEDULED">SCHEDULED</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>

        <button type="submit" className="rounded-2xl bg-blue-600 px-6 py-3 text-white">Save Changes</button>
      </form>
    </main>
  );
}
