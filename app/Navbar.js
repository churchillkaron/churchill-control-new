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
    { name: "Kitchen", href: "/kitchen" },
    { name: "Staff", href: "/staff" },
    { name: "History", href: "/history" },
    { name: "Accounting", href: "/accounting" },
    { name: "Payout", href: "/payout" },
  ];

  const switchUser = () => {
    // 🔥 CLEAR SESSION
    localStorage.removeItem("staffName");
    localStorage.removeItem("staffRole");

    // 🔥 REDIRECT TO LOGIN
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
        <div className="flex items-center gap-2 overflow-x-auto">

          {navItems.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "bg-[#ff7a00] text-black px-3 py-2 rounded-lg whitespace-nowrap"
                    : "text-white/60 px-3 py-2 hover:text-white whitespace-nowrap"
                }
              >
                {item.name}
              </Link>
            );
          })}

          {/* 🔥 SWITCH USER BUTTON */}
          <button
            onClick={switchUser}
            className="ml-4 text-sm text-red-400 hover:text-red-300"
          >
            Switch User
          </button>

        </div>

      </div>
    </div>
  );
}