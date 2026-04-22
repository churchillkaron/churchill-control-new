"use client";

import { useEffect, useState } from "react";
import { getCurrentTenant } from "@/lib/tenant";
import { supabase } from "@/lib/supabase";

export default function SystemLayout({ children }) {
  const [tenant, setTenant] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        setReady(true);
        return;
      }

      await fetch("/api/auth/onboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
        }),
      });

      const tenantData = await getCurrentTenant();
      setTenant(tenantData);
      setReady(true);
    }

    load();
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        No tenant found
      </div>
    );
  }

  const { client } = tenant;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-white/10 bg-black/60 px-4 md:px-6 backdrop-blur">
        <div
          className="text-lg tracking-widest"
          style={{ color: client.primary_color }}
        >
          {client.logo}
        </div>

        <div className="flex gap-4 md:gap-6 text-xs md:text-sm text-white/60">
          <a href="/marketing/design" className="hover:text-white">
            Studio
          </a>
          <a href="/marketing/dashboard" className="hover:text-white">
            Dashboard
          </a>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-20 md:px-6">
        {children}
      </div>
    </div>
  );
}