"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // 🔥 CORE NAV (PRIMARY SYSTEM)
  const mainNav = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Control", href: "/control-final" },
    { name: "POS", href: "/pos" },
    { name: "Orders", href: "/pos-control" },
  ];

  // 🔥 SECONDARY NAV (MANAGEMENT)
  const secondaryNav = [
    { name: "Staff", href: "/staff" },
    { name: "History", href: "/history" },
    { name: "Accounting", href: "/accounting" },
    { name: "Payout", href: "/payout" },
  ];

  const NavItem = ({ item }) => {
    const active = pathname === item.href;

    return (
      <Link
        href={item.href}
        className={
          active
            ? "rounded-lg bg-[#ff7a00] px-3 py-2 text-sm text-black shadow-[0_5px_20px_rgba(0,0,0,0.5)]"
            : "rounded-lg px-3 py-2 text-sm text-white/65 transition hover:bg-white/5 hover:text-white"
        }
      >
        {item.name}
      </Link>
    );
  };

  return (
    <div className="fixed top-0 left-0 w-full z-50">

      {/* BACKGROUND */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-xl border-b border-white/5" />

      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-6">

        {/* LOGO */}
        <div className="flex items-center gap-2">
          <span className="text-[#ff7a00] text-lg font-semibold">CC</span>
          <span className="text-white/90 text-sm font-medium tracking-wide">
            CHURCHILL
          </span>
        </div>

        {/* 🔥 DESKTOP NAV */}
        <div className="hidden md:flex items-center gap-2">

          <div className="flex items-center gap-1">
            {mainNav.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>

          <div className="w-px h-6 bg-white/10 mx-2" />

          <div className="flex items-center gap-1">
            {secondaryNav.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>

        </div>

        {/* 🔥 MOBILE BUTTON */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden text-white/70"
        >
          ☰
        </button>

      </div>

      {/* 🔥 MOBILE MENU */}
      {menuOpen && (
        <div className="md:hidden bg-black/90 backdrop-blur-xl border-t border-white/10 px-6 py-4 space-y-3">

          <div className="text-white/40 text-xs uppercase tracking-wider">
            Core
          </div>

          {mainNav.map((item) => (
            <NavItem key={item.href} item={item} />
          ))}

          <div className="pt-3 text-white/40 text-xs uppercase tracking-wider">
            Management
          </div>

          {secondaryNav.map((item) => (
            <NavItem key={item.href} item={item} />
          ))}

        </div>
      )}
    </div>
  );
}