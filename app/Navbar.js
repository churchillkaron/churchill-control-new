"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Control", href: "/control-final" },
    { name: "POS", href: "/pos" },
    { name: "History", href: "/history" },
    { name: "Accounting", href: "/accounting" },
    { name: "Payout", href: "/payout" },
  ];

  return (
    <div className="fixed top-0 left-0 w-full z-50 bg-black/30 backdrop-blur-lg">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        <div className="text-[#ff7a00] font-semibold">
          CC CHURCHILL
        </div>

        <div className="flex gap-4">
          {navItems.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "text-black bg-[#ff7a00] px-3 py-1 rounded" : "text-white/60"}
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