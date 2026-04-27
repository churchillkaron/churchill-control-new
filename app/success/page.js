"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
export const dynamic = "force-dynamic";
export default function Success() {
  const params = useSearchParams();
  const userId = params.get("user");

  useEffect(() => {
    async function updatePlan() {
      if (!userId) return;

      await supabase
        .from("profiles")
        .update({ plan: "pro" })
        .eq("id", userId);
    }

    updatePlan();
  }, [userId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <h1 className="text-2xl">Payment successful 🎉</h1>
    </div>
  );
}