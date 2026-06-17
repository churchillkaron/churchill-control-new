"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function EditPatientPage() {
  const params = useParams();

  const [form, setForm] =
    useState(null);

  useEffect(() => {
    async function load() {
      const response =
        await fetch(
          `/api/healthcare/patients/${params.patientId}`
        );

      const result =
        await response.json();

      setForm(result.data);
    }

    load();
  }, [params.patientId]);

  async function save(e) {
    e.preventDefault();

    await fetch(
      `/api/healthcare/patients/${params.patientId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify(form),
      }
    );

    alert("Saved");
  }

  if (!form) {
    return (
      <main className="p-8">
        Loading...
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-4xl font-bold">
        Edit Patient
      </h1>

      <form
        onSubmit={save}
        className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-8"
      >
        <input
          value={form.first_name || ""}
          onChange={(e) =>
            setForm({
              ...form,
              first_name:
                e.target.value,
            })
          }
          className="w-full rounded-xl border border-white/10 bg-transparent p-3"
        />

        <input
          value={form.last_name || ""}
          onChange={(e) =>
            setForm({
              ...form,
              last_name:
                e.target.value,
            })
          }
          className="w-full rounded-xl border border-white/10 bg-transparent p-3"
        />

        <input
          value={form.phone || ""}
          onChange={(e) =>
            setForm({
              ...form,
              phone:
                e.target.value,
            })
          }
          className="w-full rounded-xl border border-white/10 bg-transparent p-3"
        />

        <input
          value={form.email || ""}
          onChange={(e) =>
            setForm({
              ...form,
              email:
                e.target.value,
            })
          }
          className="w-full rounded-xl border border-white/10 bg-transparent p-3"
        />

        <button
          className="rounded-2xl bg-blue-600 px-6 py-3 text-white"
        >
          Save Changes
        </button>
      </form>
    </main>
  );
}
