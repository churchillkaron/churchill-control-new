"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Control", href: "/control-final" },
    { name: "POS", href: "/pos" },
    { name: "History", href: "/history" },
    { name: "Accounting", href: "/accounting" },
    { name: "Payout", href: "/payout" },
  ];

  return (
    <div className="fixed top-0 left-0 w-full z-50">

      {/* Glass background */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-xl border-b border-white/10" />

      <div className="relative max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">

        {/* LOGO */}
        <div className="flex items-center gap-2">
          <span className="text-[#ff7a00] font-semibold">CC</span>
          <span className="text-white/80 text-sm tracking-wide">
            CHURCHILL
          </span>
        </div>

        {/* DESKTOP NAV */}
        <div className="hidden md:flex items-center gap-2">

          {navItems.map((item, i) => {
            const active = pathname === item.href;

            return (
              <Link
                key={i}
                href={item.href}
                className={`px-4 py-2 rounded-lg text-sm transition
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

        {/* MOBILE MENU BUTTON */}
        <div className="md:hidden">
          <button className="px-3 py-2 rounded-lg bg-white/10 backdrop-blur text-white">
            Menu
          </button>
        </div>

      </div>
    </div>
  );
}