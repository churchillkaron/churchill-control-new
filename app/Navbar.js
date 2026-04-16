```javascript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Control Final", href: "/control-final" },
  { label: "POS", href: "/pos" },
  { label: "Accounting", href: "/accounting" },
  { label: "Payout", href: "/payout" },
  { label: "History", href: "/history" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isActive = (href) => {
    if (href === "/") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-5 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-[#ff7a00]/12 via-white/5 to-[#ff7a00]/8" />

          <div className="relative flex items-center justify-between px-4 py-3 sm:px-5 lg:px-6">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#ff7a00]/35 bg-[#ff7a00]/15 text-[#ff7a00]">
                CC
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-white/45">
                  Churchill
                </p>
                <p className="text-sm font-semibold text-white">
                  Control System V6
                </p>
              </div>
            </Link>

            <nav className="hidden lg:flex items-center gap-2">
              {navItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-xl px-4 py-2 text-sm ${
                      active
                        ? "bg-[#ff7a00]/20 text-white"
                        : "bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden h-10 w-10 rounded-xl bg-white/10 text-white"
            >
              ☰
            </button>
          </div>

          {mobileOpen && (
            <div className="lg:hidden border-t border-white/10 p-3">
              <div className="grid gap-2">
                {navItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-xl px-4 py-3 ${
                        active
                          ? "bg-[#ff7a00]/20 text-white"
                          : "bg-white/5 text-white/70"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
```
