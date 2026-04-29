"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Rocket, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function FinalSetupActivation() {
  const router = useRouter();

  const [tenantId, setTenantId] = useState(null);
  const [loading, setLoading] = useState(false);

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

  const handleActivate = async () => {
  if (loading) return;

  if (!tenantId) {
    alert("No tenant");
    return;
  }

  setLoading(true);

  try {
    const { error } = await supabase
      .from("tenants")
      .update({
        setup_step: 9, // ✅ FINAL STEP
        setup_complete: true,
      })
      .eq("id", tenantId);

    if (error) throw error;

    router.push("/control");

  } catch (err) {
    console.error("Activation error:", err);
    alert("Error activating system");
    setLoading(false);
  }
};
  return (
    <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl px-6"
      >
        <Card className="bg-white/[0.05] border-white/10 rounded-3xl">
          <CardContent className="p-10 text-center">

            <div className="flex justify-center mb-6">
              <CheckCircle2 size={48} className="text-green-400" />
            </div>

            <h1 className="text-4xl font-semibold mb-4">
              System Ready
            </h1>

            <p className="text-white/60 mb-8">
              Your setup is complete. Your business is now fully configured and ready to operate.
            </p>

            <div className="space-y-3 text-sm text-white/60 mb-8">
              <p>✔ Business configured</p>
              <p>✔ Staff added</p>
              <p>✔ Products & recipes connected</p>
              <p>✔ Inventory system ready</p>
              <p>✔ Financial logic active</p>
            </div>

            <Button
              onClick={handleActivate}
              disabled={loading}
              className="w-full h-14 bg-orange-500 text-black text-lg"
            >
              {loading ? "Activating..." : "Launch System"}
              <Rocket className="ml-2" />
            </Button>

          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}
