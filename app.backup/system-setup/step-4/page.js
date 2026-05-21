"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, Plus, Trash2, Upload, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/shared/supabase/client";

export default function StaffSetupPremium() {
  const router = useRouter();

  const [tenantId, setTenantId] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);

  const [staff, setStaff] = useState([
    { name: "", role: "Manager", department: "", email: "", salary: "" },
  ]);

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: acc } = await supabase
        .from("staff_accounts")
        .select("tenant_id")
        .eq("user_id", user.id)
        .single();

      if (acc?.tenant_id) {
        setTenantId(acc.tenant_id);

        const { data: deps } = await supabase
          .from("departments")
          .select("name")
          .eq("tenant_id", acc.tenant_id);

        setDepartments(deps || []);
      }
    };

    loadData();
  }, []);

  const updateStaff = (i, field, value) => {
    const updated = [...staff];
    updated[i][field] = value;
    setStaff(updated);
  };

  const addStaff = () => {
    setStaff([
      ...staff,
      { name: "", role: "Staff", department: "", email: "", salary: "" },
    ]);
  };

  const removeStaff = (i) => {
    setStaff(staff.filter((_, idx) => idx !== i));
  };

  const handleCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const Papa = (await import("papaparse")).default;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const parsed = res.data.map((r) => ({
          name: r.Name || "",
          role: r.Role || "Staff",
          department: r.Department || "",
          email: r.Email || "",
          salary: r.Salary || "",
        }));
        setStaff(parsed);
      },
    });
  };

  const handleSave = async () => {
  if (loading) return;

  if (!tenantId) {
    alert("No tenant");
    return;
  }

  setLoading(true);

  try {
    // 🔥 CLEAN OLD STAFF
    await supabase.from("staff_accounts").delete().eq("tenant_id", tenantId);

    // 🔥 PREPARE DATA
    const staffData = staff
      .filter((s) => s.name)
      .map((s) => ({
        name: s.name,
        role: s.role,
        department: s.department,
        email: s.email,
        salary_base: s.salary, // ✅ FIXED
        tenant_id: tenantId,
        status: "active", // ✅ ADD
      }));

    if (staffData.length) {
      const { error } = await supabase.from("staff_accounts").insert(staffData);
      if (error) throw error;
    }

    // 🔥 UPDATE STEP
    const { error: stepError } = await supabase
      .from("tenants")
      .update({ setup_step: 5 })
      .eq("id", tenantId);

    if (stepError) throw stepError;

    router.push("/system-setup/step-5");

  } catch (err) {
    console.error("Staff setup error:", err);
    alert("Error saving staff");
    setLoading(false);
  }
};
  return (
    <main className="min-h-screen bg-[#050505] text-white relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,120,40,0.25),transparent_40%)]" />

      <section className="relative z-10 max-w-7xl mx-auto px-6 py-10">
        <header className="flex justify-between mb-12">
          <div>
            <p className="text-orange-400 uppercase tracking-[0.3em]">System Setup</p>
            <h1 className="text-5xl font-semibold">Staff Setup</h1>
            <p className="text-white/60 mt-3">Add your team and assign departments.</p>
          </div>
          <span className="text-white/60">Step 4 of 10</span>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
          <div className="space-y-6">

            <Card className="bg-white/[0.04] border-white/10 rounded-3xl">
              <CardContent className="p-6">
                <div className="flex justify-between mb-6">
                  <h2 className="text-xl flex items-center gap-2">
                    <Users /> Team
                  </h2>

                  <div className="flex gap-3">
                    <label className="bg-white/10 px-4 py-2 rounded-xl cursor-pointer flex items-center gap-2">
                      <Upload size={16} /> CSV
                      <input type="file" accept=".csv" onChange={handleCSV} className="hidden" />
                    </label>

                    <Button onClick={addStaff} className="bg-orange-500 text-black">
                      <Plus size={16} /> Add
                    </Button>
                  </div>
                </div>

                {staff.map((s, i) => (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3">
                    <input placeholder="Name" value={s.name} onChange={(e) => updateStaff(i, "name", e.target.value)} className="bg-white/5 border border-white/10 px-3 py-2 rounded-xl" />
                    <input placeholder="Role" value={s.role} onChange={(e) => updateStaff(i, "role", e.target.value)} className="bg-white/5 border border-white/10 px-3 py-2 rounded-xl" />

                    <select value={s.department} onChange={(e) => updateStaff(i, "department", e.target.value)} className="bg-white/5 border border-white/10 px-3 py-2 rounded-xl">
                      <option value="">Department</option>
                      {departments.map((d, idx) => (
                        <option key={idx} value={d.name}>{d.name}</option>
                      ))}
                    </select>

                    <input placeholder="Email" value={s.email} onChange={(e) => updateStaff(i, "email", e.target.value)} className="bg-white/5 border border-white/10 px-3 py-2 rounded-xl" />
                    <input placeholder="Salary" value={s.salary} onChange={(e) => updateStaff(i, "salary", e.target.value)} className="bg-white/5 border border-white/10 px-3 py-2 rounded-xl" />

                    <button onClick={() => removeStaff(i)} className="text-red-400">
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <aside className="bg-white/[0.05] border border-white/10 rounded-3xl p-6">
            <h3 className="text-2xl font-semibold mb-4">Summary</h3>
            <p className="text-white/60 text-sm">Total staff: {staff.length}</p>

            <Button onClick={handleSave} disabled={loading} className="w-full mt-8 h-14 bg-orange-500 text-black">
              Continue
              <ArrowRight className="ml-2" />
            </Button>
          </aside>
        </div>
      </section>
    </main>
  );
}