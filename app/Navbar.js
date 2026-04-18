"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Control", href: "/control-final" },
    { name: "POS", href: "/pos" },
    { name: "Orders", href: "/pos-control" },
    { name: "Staff", href: "/staff" },
    { name: "History", href: "/history" },
    { name: "Accounting", href: "/accounting" },
    { name: "Payout", href: "/payout" },
  ];

  const logout = () => {
    localStorage.removeItem("staffName");
    localStorage.removeItem("staffRole");
    window.location.href = "/";
  };

  return (
    <div className="fixed top-0 left-0 w-full z-50">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-xl border-b border-white/5" />

      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-6">

        {/* LOGO */}
        <div className="flex items-center gap-2">
          <span className="text-[#ff7a00] font-semibold">CC</span>
          <span className="text-white/80 text-sm">CHURCHILL</span>
        </div>

        {/* NAV */}
        <div className="flex items-center gap-2">

          {navItems.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "bg-[#ff7a00] text-black px-3 py-2 rounded-lg"
                    : "text-white/60 px-3 py-2 hover:text-white"
                }
              >
                {item.name}
              </Link>
            );
          })}

          {/* 🔥 LOGOUT */}
          <button
            onClick={logout}
            className="ml-4 text-red-400 text-sm"
          >
            Logout
          </button>

        </div>

      </div>
    </div>
  );
}