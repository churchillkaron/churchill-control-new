"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Globe,
  Coins,
  ArrowRight,
  CheckCircle2,
  Upload,
  FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SystemSetupStepTwo() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [tenantId, setTenantId] = useState(null);
  const [csvName, setCsvName] = useState("");
  const [csvRows, setCsvRows] = useState([]);

  const [form, setForm] = useState({
    name: "",
    country: "Thailand",
    currency: "THB",
  });

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

  const update = (field, value) => {
    setForm({ ...form, [field]: value });
  };

  const handleCSVUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvName(file.name);

    const Papa = (await import("papaparse")).default;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvRows(results.data || []);

        const row = results.data?.[0];

        if (row) {
          setForm({
            name: row.BusinessName || row.name || "",
            country: row.Country || "Thailand",
            currency: row.Currency || "THB",
          });
        }
      },
    });
  };

  const handleSave = async () => {
    if (!tenantId) return alert("No tenant found");
    if (!form.name) return alert("Business name required");

    setLoading(true);

    const { error } = await supabase
      .from("tenants")
      .update({
        name: form.name,
        country: form.country,
        currency: form.currency,
        setup_step: 2,
      })
      .eq("id", tenantId);

    if (error) {
      console.error(error);
      alert("Error saving business");
      setLoading(false);
      return;
    }

    router.push("/system-setup/step-3");
  };

  return (
    <main className="min-h-screen bg-[#070707] text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,120,40,0.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,85,0,0.14),transparent_35%)]" />
      <div className="absolute inset-0 bg-black/40" />

      <section className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <header className="flex items-center justify-between mb-10">
          <div>
            <p className="text-sm text-orange-300 tracking-[0.3em] uppercase mb-2">
              System Setup
            </p>
            <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">
              Business Setup
            </h1>
            <p className="text-white/55 mt-3 max-w-2xl">
              Define your business identity. This connects your tenant, finance, reporting and AI logic.
            </p>
          </div>

          <div className="hidden md:flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-400 shadow-[0_0_18px_rgba(251,146,60,0.9)]" />
            <span className="text-sm text-white/70">Step 2 of 10</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="space-y-6"
          >
            <Card className="bg-white/[0.04] border-white/10 rounded-3xl">
              <CardContent className="p-6 space-y-6">
                <div>
                  <label className="text-sm text-white/60">Business Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="Enter business name"
                    className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-white/60">Country</label>
                    <input
                      value={form.country}
                      onChange={(e) => update("country", e.target.value)}
                      className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-white/60">Currency</label>
                    <input
                      value={form.currency}
                      onChange={(e) => update("currency", e.target.value)}
                      className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="rounded-3xl bg-white/[0.06] border border-white/10 backdrop-blur-xl p-6 h-fit sticky top-8"
          >
            <p className="text-sm text-orange-300 uppercase tracking-[0.25em] mb-3">
              Business preview
            </p>
            <h3 className="text-3xl font-semibold mb-3">{form.name || "Your Business"}</h3>

            <div className="space-y-3 mb-6 text-sm">
              <div className="flex justify-between border-b border-white/10 pb-3">
                <span className="text-white/45">Country</span>
                <span className="text-white/85">{form.country}</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-3">
                <span className="text-white/45">Currency</span>
                <span className="text-white/85">{form.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/45">Setup Progress</span>
                <span className="text-white/85">Step 2 / 10</span>
              </div>
            </div>

            <div className="rounded-2xl bg-black/30 border border-white/10 p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={18} className="text-orange-300" />
                <h4 className="font-semibold">CSV import</h4>
              </div>

              <p className="text-xs text-white/45 leading-5 mb-4">
                Upload CSV with: BusinessName, Country, Currency
              </p>

              <label className="h-12 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 cursor-pointer flex items-center justify-center gap-2 text-sm">
                <Upload size={16} /> Upload CSV
                <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
              </label>

              {csvName && (
                <div className="mt-4 text-xs text-white/55">
                  <p>{csvName}</p>
                  <p>{csvRows.length} rows</p>
                </div>
              )}
            </div>

            <Button
              onClick={handleSave}
              disabled={loading}
              className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-400 text-black font-semibold text-base"
            >
              {loading ? "Saving..." : "Continue to Structure"}
              <ArrowRight className="ml-2" size={18} />
            </Button>
          </motion.aside>
        </div>
      </section>
    </main>
  );
}
