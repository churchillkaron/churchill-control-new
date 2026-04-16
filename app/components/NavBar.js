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
    <div className="fixed top-0 left-0 w-full z-50 border-b border-[#9f9478]/40 bg-[#b6a98a]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">

        {/* BRAND */}
        <div className="flex items-center gap-2">
          <span className="text-orange-500 text-3xl font-extrabold">
            CC
          </span>
          <span className="text-[#2f2a24] text-xl font-semibold">
            Churchill
          </span>
        </div>

        {/* NAV */}
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
                    ? "bg-[#d2c6a8] border-[#9f9478] text-[#2f2a24]"
                    : "border-[#9f9478]/50 text-[#2f2a24] hover:bg-[#d2c6a8]/70"
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