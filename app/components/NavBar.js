"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Control", href: "/control-final" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "POS", href: "/pos-control" },
  { label: "History", href: "/history" },
  { label: "Accounting", href: "/accounting" },
  { label: "Payout", href: "/payout" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-50 w-full border-b border-[#9f9478]/40 bg-[#b6a98a]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">

        {/* ===== BRAND ===== */}
        <div className="flex items-center gap-3 group cursor-default">

          <div className="text-orange-500 text-3xl font-extrabold tracking-tight transition group-hover:scale-105">
            CC
          </div>

          <div className="text-[#2f2a24] text-xl font-semibold tracking-wide">
            Churchill
          </div>

        </div>

        {/* ===== NAV ===== */}
        <div className="flex gap-2 overflow-x-auto">

          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "border-[#9f9478] bg-[#d2c6a8] text-[#2f2a24] shadow-sm"
                    : "border-[#9f9478]/50 bg-transparent text-[#2f2a24] hover:bg-[#d2c6a8]/70 hover:shadow-sm"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

        </div>
      </div>
    </div>
  );
}