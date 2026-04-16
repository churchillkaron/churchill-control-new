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
    <div className="sticky top-0 z-50 w-full border-b border-[#a89c80]/40 bg-[#b6a98a]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">

        {/* ===== BRAND ===== */}
        <div className="flex items-center gap-3">

          {/* CC (dominant) */}
          <div className="text-orange-500 text-2xl font-extrabold tracking-tight">
            CC
          </div>

          {/* Churchill (secondary but bigger than before) */}
          <div className="text-[#2f2a24] text-lg font-semibold tracking-wide">
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
                className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? "border-[#a89c80] bg-[#cbbfa3] text-[#2f2a24]"
                    : "border-[#a89c80]/60 bg-transparent text-[#2f2a24] hover:bg-[#cbbfa3]/70"
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