"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  if (pathname === "/") return null;

  const navItems = [
    { name: "Control", href: "/control-final" },
    { name: "Dashboard", href: "/dashboard" },
    { name: "POS", href: "/pos" },
    { name: "History", href: "/history" },
    { name: "Accounting", href: "/accounting" },
    { name: "Payout", href: "/payout" },
  ];

  return (
    <div className="fixed top-0 left-0 w-full z-[9999] backdrop-blur-xl bg-black/40 border-b border-white/10">

      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">

        {/* LOGO */}
        <Link href="/" className="flex items-center gap-3">
          <span className="text-[#ff7a00] text-2xl font-semibold">CC</span>
          <span className="text-white text-lg">Churchill</span>
        </Link>

        {/* DESKTOP */}
        <div className="hidden md:flex gap-3">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
            >
              {item.name}
            </Link>
          ))}
        </div>
      </div>

      {/* MOBILE */}
      <div className="md:hidden flex gap-2 overflow-x-auto px-4 pb-3">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="px-3 py-2 rounded-lg bg-white/10 text-sm whitespace-nowrap"
          >
            {item.name}
          </Link>
        ))}
      </div>
    </div>
  );
}