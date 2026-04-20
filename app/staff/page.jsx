"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function StaffPage() {
  const [staff, setStaff] = useState([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("FOH");

  useEffect(() => {
    loadStaff();
  }, []);

  const loadStaff = () => {
    const stored = JSON.parse(localStorage.getItem("staff") || "[]");
    setStaff(stored);
  };

  const saveStaff = (updated) => {
    localStorage.setItem("staff", JSON.stringify(updated));
    setStaff(updated);
  };

  const addStaff = () => {
    if (!name) return;

    const updated = [
      ...staff,
      {
        id: Date.now(),
        name,
        role,
        score: 100,
      },
    ];

    saveStaff(updated);
    setName("");
  };

  const removeStaff = (id) => {
    const updated = staff.filter((s) => s.id !== id);
    saveStaff(updated);
  };

  // 🔥 UPDATE SCORE
  const updateScore = (id, value) => {
    const updated = staff.map((s) =>
      s.id === id ? { ...s, score: Number(value) } : s
    );
    saveStaff(updated);
  };

  return (
    <AppShell>
      <div className="text-white space-y-6">

        <h1 className="text-2xl">Staff System</h1>

        {/* ADD STAFF */}
        <div className="bg-white/5 p-4 rounded space-y-2">
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full text-black px-2 py-1"
          />

          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full text-black px-2 py-1"
          >
            <option value="FOH">FOH</option>
            <option value="BAR">BAR</option>
            <option value="KITCHEN">KITCHEN</option>
          </select>

          <button
            onClick={addStaff}
            className="w-full bg-green-500 py-2 rounded text-black"
          >
            ADD STAFF
          </button>
        </div>

        {/* STAFF LIST */}
        <div className="space-y-3">
          {staff.map((s) => (
            <div
              key={s.id}
              className="bg-white/5 p-3 rounded space-y-2"
            >
              <div className="flex justify-between items-center">
                <div>
                  <div>{s.name}</div>
                  <div className="text-white/50 text-sm">{s.role}</div>
                </div>

                <button
                  onClick={() => removeStaff(s.id)}
                  className="bg-red-500 px-2 py-1 rounded"
                >
                  REMOVE
                </button>
              </div>

              {/* 🔥 SCORE CONTROL */}
              <div className="flex items-center gap-2">
                <div className="text-sm text-white/50">Score</div>
                <input
                  type="number"
                  value={s.score}
                  onChange={(e) => updateScore(s.id, e.target.value)}
                  className="w-20 text-black px-2 py-1"
                />
              </div>

            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}