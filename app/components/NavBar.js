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
    <div className="w-full border-b border-[#4a443b] bg-[#2f2a24]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-5 px-6 py-5">
        
        {/* Logo */}
        <div className="mr-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5f1e8] text-[#2f2a24] text-lg font-bold">
            ▲
          </div>
          <div className="text-[#f5f1e8] text-2xl font-semibold">
            Churchill Control System
          </div>
        </div>

        {/* Navigation */}
        <div className="flex flex-wrap gap-4">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-2xl border px-7 py-4 text-xl font-semibold transition ${
                  isActive
                    ? "border-[#5a5247] bg-[#3a342d] text-[#f5f1e8]"
                    : "border-[#4a443b] bg-[#2f2a24] text-[#d2c6b2] hover:bg-[#3a342d] hover:text-[#f5f1e8]"
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