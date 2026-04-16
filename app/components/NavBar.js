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
    <div className="fixed top-0 left-0 w-full z-50 border-b border-[#4a443b] bg-[#2f2a24]">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">

        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f5f1e8] text-[#2f2a24] text-sm font-bold">
            ▲
          </div>
          <div className="text-[#f5f1e8] text-base font-semibold">
            Churchill
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-2 overflow-x-auto">

          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition ${
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