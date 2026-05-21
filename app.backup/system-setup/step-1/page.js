"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Utensils,
  Coffee,
  Martini,
  Factory,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/shared/supabase/client";

const types = [
  {
    id: "restaurant",
    title: "Restaurant",
    desc: "Full POS, tables, kitchen flow, recipes, service charge and performance tracking.",
    icon: Utensils,
  },
  {
    id: "cafe",
    title: "Café",
    desc: "Fast counter sales, drinks, light food and simplified stock + workflow.",
    icon: Coffee,
  },
  {
    id: "bar",
    title: "Bar",
    desc: "Drink-focused sales, waste tracking, bottle control and bar performance.",
    icon: Martini,
  },
  {
    id: "production",
    title: "Production",
    desc: "Ingredient-based production, cost control, inventory and output tracking.",
    icon: Factory,
  },
];

export default function StepOnePremium() {
  const router = useRouter();

  const [selected, setSelected] = useState("restaurant");
  const [tenantId, setTenantId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadTenant = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("staff_accounts")
        .select("tenant_id")
        .eq("auth_user_id", user.id)
        .single();

      if (error || !data?.tenant_id) {
        console.error("Tenant not found for user");
        return;
      }

      setTenantId(data.tenant_id);
    };

    loadTenant();
  }, []);

  const handleContinue = async () => {
    if (loading) return;

    if (!tenantId) {
      alert("No tenant found");
      return;
    }

    if (!selected) {
      alert("Please select a business type");
      return;
    }

    setLoading(true);

    const { error } = await supabase
      .from("tenants")
      .update({
        business_type: selected,
        setup_step: 2, // ✅ FIXED
      })
      .eq("id", tenantId);

    if (error) {
      console.error(error);
      alert("Error saving type");
      setLoading(false);
      return;
    }

    router.push("/system-setup/step-2");
  };

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,120,40,0.25),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(255,85,0,0.15),transparent_40%)]" />

      <section className="relative z-10 max-w-7xl mx-auto px-6 py-10">
        <header className="flex items-center justify-between mb-12">
          <div>
            <p className="text-sm text-orange-400 tracking-[0.3em] uppercase mb-2">
              System Setup
            </p>
            <h1 className="text-5xl font-semibold">Choose System Type</h1>
            <p className="text-white/60 mt-4 max-w-2xl">
              This defines how your entire system operates — POS, stock, staff, automation and AI behavior.
            </p>
          </div>

          <div className="hidden md:flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/10">
            <span className="w-2 h-2 bg-orange-400 rounded-full" />
            <span className="text-sm text-white/70">Step 1 of 10</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {types.map((t) => {
              const Icon = t.icon;
              const active = selected === t.id;

              return (
                <div
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`p-6 rounded-3xl border cursor-pointer transition-all ${
                    active
                      ? "border-orange-500 bg-orange-500/10 shadow-lg"
                      : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                  }`}
                >
                  <div className="flex justify-between mb-4">
                    <div className={`p-3 rounded-xl ${active ? "bg-orange-500 text-black" : "bg-white/10"}`}>
                      <Icon size={24} />
                    </div>
                    {active && <CheckCircle2 className="text-orange-400" />}
                  </div>

                  <h2 className="text-2xl font-semibold mb-2">{t.title}</h2>
                  <p className="text-sm text-white/60 leading-6">{t.desc}</p>
                </div>
              );
            })}
          </motion.div>

          <aside className="bg-white/[0.05] border border-white/10 rounded-3xl p-6">
            <h3 className="text-2xl font-semibold mb-4">System Preview</h3>

            <p className="text-white/60 text-sm mb-6">
              Selected system will configure all logic automatically.
            </p>

            <div className="space-y-4 text-sm">
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-white/50">Type</span>
                <span>{selected}</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-white/50">POS</span>
                <span>Enabled</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-white/50">Stock</span>
                <span>Auto</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">AI</span>
                <span>Assisted</span>
              </div>
            </div>

            <Button
              onClick={handleContinue}
              disabled={loading}
              className="w-full mt-8 h-14 bg-orange-500 text-black text-base"
            >
              {loading ? "Saving..." : "Continue to Business Setup"}
              <ArrowRight className="ml-2" />
            </Button>
          </aside>
        </div>
      </section>
    </main>
  );
}