"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  Percent,
  Shield,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/shared/supabase/client";

export default function FinanceControlSetup() {
  const router = useRouter();

  const [tenantId, setTenantId] = useState(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    service_charge: "5",
    foh_split: "50",
    bar_split: "30",
    kitchen_split: "20",
    approval_limit: "10000",
  });

  useEffect(() => {
    const loadTenant = async () => {
      const { data: { user } } = await supabase.auth.getUser();
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

  const update = (field, value) => {
    setForm({ ...form, [field]: value });
  };

  const handleSave = async () => {
  if (loading) return;

  if (!tenantId) {
    alert("No tenant");
    return;
  }

  setLoading(true);

  try {
    const totalSplit =
      Number(form.foh_split) +
      Number(form.bar_split) +
      Number(form.kitchen_split);

    if (totalSplit !== 100) {
      alert("FOH + BAR + KITCHEN must equal 100%");
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("tenants")
      .update({
        service_charge: Number(form.service_charge),
        foh_split: Number(form.foh_split),
        bar_split: Number(form.bar_split),
        kitchen_split: Number(form.kitchen_split),
        approval_limit: Number(form.approval_limit),
        setup_step: 8, // ✅ FIXED
      })
      .eq("id", tenantId);

    if (error) throw error;

    router.push("/system-setup/step-8");

  } catch (err) {
    console.error("Finance setup error:", err);
    alert("Error saving finance settings");
    setLoading(false);
  }
};

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <section className="max-w-7xl mx-auto px-6 py-10">
        <header className="flex justify-between mb-10">
          <div>
            <p className="text-orange-400 uppercase tracking-[0.3em]">System Setup</p>
            <h1 className="text-5xl font-semibold">Finance & Control</h1>
            <p className="text-white/60 mt-3">
              Define how money flows and how control rules apply in your system.
            </p>
          </div>
          <span className="text-white/60">Step 7 of 10</span>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">

          <div className="space-y-6">

            {/* SERVICE CHARGE */}
            <Card className="bg-white/[0.04] border-white/10">
              <CardContent className="p-6 space-y-5">
                <h2 className="flex items-center gap-2 text-xl">
                  <Percent /> Service Charge
                </h2>

                <input
                  value={form.service_charge}
                  onChange={(e) => update("service_charge", e.target.value)}
                  placeholder="Service %"
                  className="w-full bg-white/5 border border-white/10 p-3 rounded-xl"
                />

                <div className="grid grid-cols-3 gap-3">
                  <input value={form.foh_split} onChange={(e) => update("foh_split", e.target.value)} placeholder="FOH %" className="bg-white/5 border border-white/10 p-2 rounded" />
                  <input value={form.bar_split} onChange={(e) => update("bar_split", e.target.value)} placeholder="BAR %" className="bg-white/5 border border-white/10 p-2 rounded" />
                  <input value={form.kitchen_split} onChange={(e) => update("kitchen_split", e.target.value)} placeholder="KITCHEN %" className="bg-white/5 border border-white/10 p-2 rounded" />
                </div>
              </CardContent>
            </Card>

            {/* APPROVAL RULES */}
            <Card className="bg-white/[0.04] border-white/10">
              <CardContent className="p-6 space-y-5">
                <h2 className="flex items-center gap-2 text-xl">
                  <Shield /> Approval Control
                </h2>

                <input
                  value={form.approval_limit}
                  onChange={(e) => update("approval_limit", e.target.value)}
                  placeholder="Max amount before approval required"
                  className="w-full bg-white/5 border border-white/10 p-3 rounded-xl"
                />
              </CardContent>
            </Card>

          </div>

          <aside className="bg-white/[0.05] border border-white/10 p-6 rounded-3xl">
            <h3 className="text-xl mb-4">Financial Logic</h3>

            <div className="text-sm text-white/60 space-y-2">
              <p>Service Charge: {form.service_charge}%</p>
              <p>FOH: {form.foh_split}%</p>
              <p>BAR: {form.bar_split}%</p>
              <p>KITCHEN: {form.kitchen_split}%</p>
              <p className="text-orange-400">Approval limit: {form.approval_limit}</p>
            </div>

            <Button onClick={handleSave} disabled={loading} className="w-full mt-6 bg-orange-500 text-black h-12">
              Continue
              <ArrowRight className="ml-2" />
            </Button>
          </aside>

        </div>
      </section>
    </main>
  );
}
