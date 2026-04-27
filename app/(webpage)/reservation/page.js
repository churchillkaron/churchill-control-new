"use client";

import { useState } from "react";
import { saveReservation } from "@/lib/reservations";
export const dynamic = "force-dynamic";
export default function Reservation() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    date: "",
    time: "",
    guests: "",
    notes: "",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    saveReservation(form);

    alert("Reservation created");

    setForm({
      name: "",
      phone: "",
      date: "",
      time: "",
      guests: "",
      notes: "",
    });
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">

      <div className="w-full max-w-xl">

        <h1 className="text-4xl md:text-5xl font-semibold mb-4 text-center">
          Reserve Your Table
        </h1>

        <p className="text-gray-400 text-center mb-10">
          Dinner, drinks, live music, and games — all in one place.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">

          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Name"
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10"
          />

          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="Phone / WhatsApp"
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10"
          />

          <div className="grid grid-cols-2 gap-4">
            <input
              name="date"
              type="date"
              value={form.date}
              onChange={handleChange}
              className="p-4 rounded-xl bg-white/5 border border-white/10"
            />
            <input
              name="time"
              type="time"
              value={form.time}
              onChange={handleChange}
              className="p-4 rounded-xl bg-white/5 border border-white/10"
            />
          </div>

          <input
            name="guests"
            value={form.guests}
            onChange={handleChange}
            placeholder="Guests"
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10"
          />

          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Special requests (optional)"
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10"
          />

          <button className="w-full py-4 bg-[#ff7a00] rounded-xl">
            Request Reservation
          </button>

        </form>

      </div>

    </main>
  );
}
