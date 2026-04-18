"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

export default function AppShell({ children }) {
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const name = localStorage.getItem("staffName");
    const role = localStorage.getItem("staffRole");

    if (!name || !role) {
      window.location.href = "/";
      return;
    }

    const accessMap = {
      FOH: ["/pos"],
      BAR: ["/kitchen"],
      KITCHEN: ["/kitchen"],
      MANAGER: ["/dashboard", "/control-final", "/tables", "/staff-control"],
      ACCOUNTING: ["/accounting"],
      OWNER: [
        "/dashboard",
        "/control-final",
        "/pos",
        "/kitchen",
        "/history",
        "/accounting",
        "/payout",
        "/tables",
        "/staff-control",
      ],
    };

    const allowedRoutes = accessMap[role] || [];

    const isAllowed = allowedRoutes.some((route) =>
      pathname.startsWith(route)
    );

    if (!isAllowed) {
      // redirect safely AFTER role is known
      if (role === "FOH") window.location.href = "/pos";
      else if (role === "BAR") window.location.href = "/kitchen";
      else if (role === "KITCHEN") window.location.href = "/kitchen";
      else if (role === "MANAGER") window.location.href = "/dashboard";
      else if (role === "ACCOUNTING") window.location.href = "/accounting";
      else if (role === "OWNER") window.location.href = "/dashboard";
      return;
    }

    setAllowed(true);
    setLoading(false);
  }, [pathname]);

  // 🔥 IMPORTANT: BLOCK RENDER UNTIL AUTH READY
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!allowed) return null;

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <main className="pt-20 px-6 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  );
}