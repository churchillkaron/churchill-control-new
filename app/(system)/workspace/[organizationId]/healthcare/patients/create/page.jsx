"use client";

import { useState } from "react";
import { useOrganization } from "@/app/providers/OrganizationProvider";
import { usePatients } from "../hooks/usePatients";

export default function CreatePatientPage() {
  const { organization } = useOrganization();
  const { refresh } = usePatients(organization?.id);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    phone: "",
    email: ""
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/healthcare/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, organization_id: organization.id })
    });
    setLoading(false);
    refresh();
    setForm({
      first_name: "",
      last_name: "",
      date_of_birth: "",
      phone: "",
      email: ""
    });
  };

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Add Patient</h1>
      <form className="space-y-5 bg-white/[0.05] p-6 rounded-2xl shadow-md" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4">
          <input
            name="first_name"
            placeholder="First Name"
            value={form.first_name}
            onChange={handleChange}
            className="p-3 rounded border border-white/20 bg-black/5 text-white focus:ring-2 focus:ring-blue-600"
            required
          />
          <input
            name="last_name"
            placeholder="Last Name"
            value={form.last_name}
            onChange={handleChange}
            className="p-3 rounded border border-white/20 bg-black/5 text-white focus:ring-2 focus:ring-blue-600"
            required
          />
        </div>
        <input
          type="date"
          name="date_of_birth"
          placeholder="Date of Birth"
          value={form.date_of_birth}
          onChange={handleChange}
          className="w-full p-3 rounded border border-white/20 bg-black/5 text-white focus:ring-2 focus:ring-blue-600"
          required
        />
        <input
          name="phone"
          placeholder="Phone"
          value={form.phone}
          onChange={handleChange}
          className="w-full p-3 rounded border border-white/20 bg-black/5 text-white focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          className="w-full p-3 rounded border border-white/20 bg-black/5 text-white focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="submit"
          className={`w-full py-3 rounded-xl text-white font-semibold ${
            loading ? "bg-gray-600 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
          }`}
          disabled={loading}
        >
          {loading ? "Saving..." : "Add Patient"}
        </button>
      </form>
    </main>
  );
}
