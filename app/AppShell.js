"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

export default function AppShell({ children }) {
  const pathname = usePathname();

  useEffect(() => {
    const name = localStorage.getItem("staffName");
    const role = localStorage.getItem("staffRole");

    // 🔴 NOT LOGGED IN → BACK TO LANDING
    if (!name || !role) {
      window.location.href = "/";
      return;
    }

    // 🔒 ROLE ACCESS CONTROL
    const accessMap = {
      FOH: ["/pos"],
      BAR: ["/pos-control"],
      KITCHEN: ["/pos-control"],
      MANAGER: ["/dashboard", "/control-final", "/pos-control", "/history", "/staff-control"],
      ACCOUNTING: ["/accounting"],
      OWNER: [
        "/dashboard",
        "/control-final",
        "/pos",
        "/pos-control",
        "/history",
        "/accounting",
        "/payout",
        "/staff-control",
      ],
    };

    const allowedRoutes = accessMap[role] || [];

    const isAllowed = allowedRoutes.some((route) =>
      pathname.startsWith(route)
    );

    if (!isAllowed) {
      // 🔥 REDIRECT BASED ON ROLE
      if (role === "FOH") window.location.href = "/pos";
      else if (role === "BAR") window.location.href = "/pos-control";
      else if (role === "KITCHEN") window.location.href = "/pos-control";
      else if (role === "MANAGER") window.location.href = "/dashboard";
      else if (role === "ACCOUNTING") window.location.href = "/accounting";
      else if (role === "OWNER") window.location.href = "/dashboard";
    }
  }, [pathname]);

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <main className="pt-20 px-6 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  );
}