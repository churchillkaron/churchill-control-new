"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function StaffControlPage() {
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("staff") || "[]");
    setStaff(data);
  }, []);

  const addStaff = () => {
    const name = prompt("Enter staff name");
    const role = prompt("Enter role (FOH / BAR / KITCHEN)");

    if (!name || !role) return;

    const newStaff = {
      id: Date.now(),
      name,
      role,
    };

    const updated = [newStaff, ...staff];

    localStorage.setItem("staff", JSON.stringify(updated));
    setStaff(updated);
  };

  const removeStaff = (id) => {
    const updated = staff.filter((s) => s.id !== id);
    localStorage.setItem("staff", JSON.stringify(updated));
    setStaff(updated);
  };

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Staff Control</h1>

        <button
          onClick={addStaff}
          className="bg-[#ff7a00] px-4 py-2 rounded"
        >
          Add Staff
        </button>

        <div className="space-y-4">

          {staff.map((s) => (
            <div
              key={s.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between"
            >
              <div>
                <div>{s.name}</div>
                <div className="text-sm text-white/50">{s.role}</div>
              </div>

              <button
                onClick={() => removeStaff(s.id)}
                className="text-red-400"
              >
                Remove
              </button>
            </div>
          ))}

          {staff.length === 0 && (
            <div className="text-white/40">No staff added</div>
          )}

        </div>

      </div>
    </AppShell>
  );
}