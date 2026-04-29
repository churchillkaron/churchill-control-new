"use client";

import React, { useState } from "react";
import { Users, Plus, Trash2, Upload, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const defaultRoles = [
  "Owner",
  "General Manager",
  "Manager",
  "Head Chef",
  "Chef",
  "Bartender",
  "Waiter",
  "Cashier",
  "Production Manager",
  "Worker",
];

export default function StaffSetupFull() {
  const [departments, setDepartments] = useState([
    "FOH",
    "Kitchen",
    "Bar",
    "Production",
    "Management",
    "Admin",
  ]);

  const [roles, setRoles] = useState(defaultRoles);

  const [staff, setStaff] = useState([
    { name: "", role: "General Manager", department: "Management", salary: "", email: "" },
  ]);

  const addStaff = () => {
    setStaff([
      ...staff,
      { name: "", role: "Staff", department: "FOH", salary: "", email: "" },
    ]);
  };

  const updateStaff = (index, field, value) => {
    const updated = [...staff];
    updated[index][field] = value;
    setStaff(updated);
  };

  const removeStaff = (index) => {
    setStaff(staff.filter((_, i) => i !== index));
  };

  const handleCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const Papa = (await import("papaparse")).default;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data.map((row) => ({
          name: row.Name || "",
          role: row.Role || "Staff",
          department: row.Department || "FOH",
          salary: row.Salary || "",
          email: row.Email || "",
        }));
        setStaff(parsed);
      },
    });
  };

  return (
    <main className="min-h-screen bg-[#070707] text-white relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,120,40,0.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,85,0,0.14),transparent_35%)]" />

      <section className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <header className="flex items-center justify-between mb-10">
          <div>
            <p className="text-sm text-orange-300 uppercase tracking-[0.3em]">System Setup</p>
            <h1 className="text-4xl font-semibold mt-2">Staff Setup</h1>
            <p className="text-white/55 mt-3 max-w-3xl">
              Build your full team structure. This defines permissions, payroll, performance tracking and accountability.
            </p>
          </div>
        </header>

        <Card className="bg-white/[0.04] border-white/10 rounded-3xl">
          <CardContent className="p-6">

            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <Users className="text-orange-400" />
                <h2 className="text-xl font-semibold">Team Members</h2>
              </div>

              <div className="flex gap-3">
                <label className="bg-white/10 px-4 py-2 rounded-xl cursor-pointer flex items-center gap-2">
                  <Upload size={16} /> CSV
                  <input type="file" accept=".csv" onChange={handleCSV} className="hidden" />
                </label>

                <Button onClick={addStaff} className="bg-orange-500 text-black">
                  <Plus size={16} className="mr-2" /> Add Staff
                </Button>
              </div>
            </div>

            <div className="hidden md:grid grid-cols-[1.5fr_1fr_1fr_1fr_1.5fr_40px] gap-3 text-xs text-white/40 mb-3">
              <span>Name</span>
              <span>Role</span>
              <span>Department</span>
              <span>Salary</span>
              <span>Email</span>
              <span />
            </div>

            <div className="space-y-3">
              {staff.map((person, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr_1.5fr_40px] gap-3 bg-white/5 p-3 rounded-xl">

                  <input
                    value={person.name}
                    onChange={(e) => updateStaff(index, "name", e.target.value)}
                    placeholder="Full Name"
                    className="bg-transparent border border-white/10 rounded-lg px-3 py-2"
                  />

                  <select
                    value={person.role}
                    onChange={(e) => updateStaff(index, "role", e.target.value)}
                    className="bg-transparent border border-white/10 rounded-lg px-3 py-2"
                  >
                    {roles.map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
{person.role === "Staff" ? (
  <select
    value={person.department}
    onChange={(e) => updateStaff(index, "department", e.target.value)}
    className="bg-transparent border border-white/10 rounded-lg px-3 py-2"
  >
    {departments.map((dep) => (
      <option key={dep}>{dep}</option>
    ))}
  </select>
) : (
  <div className="text-white/40 flex items-center px-3">
    All Departments
  </div>
)}

                  <input
                    value={person.salary}
                    onChange={(e) => updateStaff(index, "salary", e.target.value)}
                    placeholder="Salary"
                    className="bg-transparent border border-white/10 rounded-lg px-3 py-2"
                  />

                  <input
                    value={person.email}
                    onChange={(e) => updateStaff(index, "email", e.target.value)}
                    placeholder="Email"
                    className="bg-transparent border border-white/10 rounded-lg px-3 py-2"
                  />

                  <button onClick={() => removeStaff(index)} className="text-red-400">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>

          </CardContent>
        </Card>

        <div className="mt-10 flex justify-end">
          <Button className="bg-orange-500 text-black h-12 px-6">
            Continue <ArrowRight className="ml-2" />
          </Button>
        </div>
      </section>
    </main>
  );
}
