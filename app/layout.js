"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const navItems = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Control Final", href: "/control-final" },
    { label: "POS", href: "/pos" },
    { label: "Accounting", href: "/accounting" },
    { label: "Payout", href: "/payout" },
    { label: "History", href: "/history" },
  ];

  const isActive = (href) => {
    return pathname === href;
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 p-4">
      <div className="max-w-7xl mx-auto bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-4 flex justify-between items-center">

        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-[#ff7a00]/20 text-[#ff7a00] rounded-xl">
            CC
          </div>
          <div>
            <div className="text-xs text-white/50 uppercase">Churchill</div>
            <div className="text-white font-semibold">Control V6</div>
          </div>
        </Link>

        {/* Desktop */}
        <div className="hidden lg:flex gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2 rounded-xl text-sm ${
                isActive(item.href)
                  ? "bg-[#ff7a00]/20 text-white"
                  : "bg-white/5 text-white/70"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Mobile Button */}
        <button
          onClick={() => setOpen(!open)}
          className="lg:hidden text-white text-xl"
        >
          ☰
        </button>
      </div>

      {/* Mobile Menu */}
      {open && (
        <div className="mt-2 max-w-7xl mx-auto bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 p-4 flex flex-col gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-4 py-3 rounded-xl bg-white/5 text-white/80"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}