"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Building,
  Users,
  Layers,
  Plus,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function StructureSetup() {
  const router = useRouter();

  const [tenantId, setTenantId] = useState(null);
  const [loading, setLoading] = useState(false);

  const [departments, setDepartments] = useState([
    { name: "FOH" },
    { name: "Kitchen" },
  ]);

  const [locations, setLocations] = useState([
    { name: "Main Location" },
  ]);

  useEffect(() => {
    const loadTenant = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("staff_accounts")
        .select("tenant_id")
        .eq("user_id", user.id)
        .single();

      if (data?.tenant_id) setTenantId(data.tenant_id);
    };

    loadTenant();
  }, []);

  const updateDepartment = (index, value) => {
    const updated = [...departments];
    updated[index].name = value;
    setDepartments(updated);
  };

  const addDepartment = () => {
    setDepartments([...departments, { name: "" }]);
  };

  const removeDepartment = (index) => {
    setDepartments(departments.filter((_, i) => i !== index));
  };

  const updateLocation = (index, value) => {
    const updated = [...locations];
    updated[index].name = value;
    setLocations(updated);
  };

  const addLocation = () => {
    setLocations([...locations, { name: "" }]);
  };

  const removeLocation = (index) => {
    setLocations(locations.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!tenantId) return alert("No tenant found");

    setLoading(true);

    // insert departments
    for (const dep of departments) {
      if (!dep.name) continue;
      await supabase.from("departments").insert({
        name: dep.name,
        tenant_id: tenantId,
      });
    }

    // insert locations
    for (const loc of locations) {
      if (!loc.name) continue;
      await supabase.from("locations").insert({
        name: loc.name,
        tenant_id: tenantId,
      });
    }

    // update setup step
    await supabase
      .from("tenants")
      .update({ setup_step: 3 })
      .eq("id", tenantId);

    router.push("/system-setup/step-4");
  };

  return (
    <main className="min-h-screen bg-[#050505] text-white relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,120,40,0.25),transparent_40%)]" />

      <section className="relative z-10 max-w-7xl mx-auto px-6 py-10">
        <header className="flex justify-between mb-12">
          <div>
            <p className="text-orange-400 uppercase tracking-[0.3em]">System Setup</p>
            <h1 className="text-5xl font-semibold">Structure Setup</h1>
            <p className="text-white/60 mt-3">
              Define departments and locations for your business.
            </p>
          </div>
          <span className="text-white/60">Step 3 of 10</span>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
          <div className="space-y-6">

            {/* Departments */}
            <Card className="bg-white/[0.04] border-white/10 rounded-3xl">
              <CardContent className="p-6">
                <div className="flex justify-between mb-6">
                  <h2 className="text-xl flex items-center gap-2">
                    <Users /> Departments
                  </h2>
                  <Button onClick={addDepartment} className="bg-orange-500 text-black">
                    <Plus size={16} /> Add
                  </Button>
                </div>

                {departments.map((dep, i) => (
                  <div key={i} className="flex gap-3 mb-3">
                    <input
                      value={dep.name}
                      onChange={(e) => updateDepartment(i, e.target.value)}
                      className="flex-1 bg-white/5 border border-white/10 px-4 py-2 rounded-xl"
                      placeholder="Department name"
                    />
                    <button onClick={() => removeDepartment(i)}>
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Locations */}
            <Card className="bg-white/[0.04] border-white/10 rounded-3xl">
              <CardContent className="p-6">
                <div className="flex justify-between mb-6">
                  <h2 className="text-xl flex items-center gap-2">
                    <Building /> Locations
                  </h2>
                  <Button onClick={addLocation} className="bg-orange-500 text-black">
                    <Plus size={16} /> Add
                  </Button>
                </div>

                {locations.map((loc, i) => (
                  <div key={i} className="flex gap-3 mb-3">
                    <input
                      value={loc.name}
                      onChange={(e) => updateLocation(i, e.target.value)}
                      className="flex-1 bg-white/5 border border-white/10 px-4 py-2 rounded-xl"
                      placeholder="Location name"
                    />
                    <button onClick={() => removeLocation(i)}>
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>

          </div>

          <aside className="bg-white/[0.05] border border-white/10 rounded-3xl p-6">
            <h3 className="text-2xl font-semibold mb-4">Structure Preview</h3>

            <div className="text-sm text-white/60 space-y-2">
              <p>Departments: {departments.length}</p>
              <p>Locations: {locations.length}</p>
            </div>

            <Button
              onClick={handleSave}
              disabled={loading}
              className="w-full mt-8 h-14 bg-orange-500 text-black"
            >
              Continue
              <ArrowRight className="ml-2" />
            </Button>
          </aside>
        </div>
      </section>
    </main>
  );
}

