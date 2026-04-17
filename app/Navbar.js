"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Control", href: "/control-final" },
    { name: "POS", href: "/pos" },
    { name: "POS Control", href: "/pos-control" },
    { name: "Staff", href: "/staff" },
    { name: "Staff Control", href: "/staff-control" },
    { name: "History", href: "/history" },
    { name: "Accounting", href: "/accounting" },
    { name: "Payout", href: "/payout" },
  ];

  return (
    <div className="fixed top-0 left-0 w-full z-50">
      
      {/* Glass background */}
      <div className="absolute inset-0 bg-black/25 backdrop-blur-xl border-b border-white/5" />

      <div className="relative max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">

        {/* LOGO */}
        <div className="flex items-center gap-2">
          <span className="text-[#ff7a00] font-semibold text-lg">CC</span>
          <span className="text-white/90 text-sm tracking-wide font-medium">
            CHURCHILL
          </span>
        </div>

        {/* NAV ITEMS */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">

          {navItems.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap transition
                  ${
                    active
                      ? "bg-[#ff7a00] text-black shadow-[0_5px_20px_rgba(0,0,0,0.5)]"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }
                `}
              >
                {item.name}
              </Link>
            );
          })}

        </div>

      </div>
    </div>
  );
} s