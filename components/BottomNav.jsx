"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/shared/supabase/client";

const TENANT_ID = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function BottomNav() {
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState(null);

  // 🔥 TEMP ROLE (change to test)
  const [role, setRole] = useState("foh");

  useEffect(() => {
    setMounted(true);
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("*")
        .eq("tenant_id", TENANT_ID)
        .single();

      if (data) setSettings(data);
    } catch (err) {
      console.error("Settings load error:", err);
    }
  };

  // 🔥 DO NOT BLOCK RENDER
  if (!mounted) return null;

  // 🔥 SAFE FALLBACK SETTINGS
  const safeSettings = settings || {
    production_mode: "combined",
  };

  // 🔥 BUILD NAV
  let links = [];

  // =========================
  // FOH
  // =========================
  if (role === "foh") {
    links = [
      { name: "Tables", href: "/operations/tables" },
      { name: "POS", href: "/operations/pos" },
      { name: "Pay", href: "/payments" },
    ];
  }

  // =========================
  // KITCHEN
  // =========================
  else if (role === "kitchen") {
    links = [{ name: "Kitchen", href: "/operations/kitchen" }];

    if (safeSettings.production_mode === "combined") {
      links.push({ name: "Prod", href: "/operations/production" });
    }
  }

  // =========================
  // MANAGER
  // =========================
  else if (role === "manager") {
    links = [
      { name: "Dash", href: "/dashboard" },
      { name: "History", href: "/history" },
      { name: "Approve", href: "/management/approval" },
    ];
  }

  // =========================
  // ACCOUNTING
  // =========================
  else if (role === "accounting") {
    links = [
      { name: "Finance", href: "/finance" },
      { name: "Reports", href: "/finance/reports" },
    ];
  }

  // 🔥 SAFETY FALLBACK
  if (links.length === 0) {
    links = [{ name: "Dashboard", href: "/dashboard" }];
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-black border-t border-white/10 flex justify-around py-2">
      {links.map((link) => {
        const active = pathname === link.href;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex flex-col items-center text-xs px-3 py-1 rounded-lg ${
              active
                ? "text-orange-400"
                : "text-white/60 hover:text-white"
            }`}
          >
            <span className="text-sm font-semibold">{link.name}</span>
          </Link>
        );
      })}
    </div>
  );
}