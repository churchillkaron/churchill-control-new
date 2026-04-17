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
      <div className="absolute inset-0 bg-black/25 backdrop-blur-xl border-b border-white/5" />

      <div className="relative mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[#ff7a00] text-lg font-semibold">CC</span>
          <span className="text-white/90 text-sm font-medium tracking-wide">
            CHURCHILL
          </span>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
          {navItems.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
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
          })}
        </div>
      </div>
    </div>
  );
}