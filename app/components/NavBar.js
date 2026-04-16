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
    <div className="sticky top-0 z-50 w-full h-[70px] border-b border-[#a89c80] bg-[#b6a98a]">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4">

        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="text-orange-500 text-lg font-bold">
            CC
          </div>
          <div className="text-[#2f2a24] text-base font-semibold">
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
                    ? "border-[#a89c80] bg-[#cbbfa3] text-[#2f2a24]"
                    : "border-[#a89c80] bg-[#b6a98a] text-[#2f2a24] hover:bg-[#cbbfa3]"
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
