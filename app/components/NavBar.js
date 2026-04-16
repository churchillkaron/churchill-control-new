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
    <div className="w-full border-b border-white/10 bg-black">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-5">
        <div className="mr-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black font-bold">
            ▲
          </div>
          <div className="text-2xl font-semibold text-white">
            Churchill Control System
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-2xl border px-7 py-4 text-2xl font-semibold transition ${
                  isActive
                    ? "border-white/20 bg-white/10 text-white"
                    : "border-white/10 bg-[#0b0b0b] text-white hover:border-white/20 hover:bg-white/5"
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