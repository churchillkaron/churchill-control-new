"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { name: "Home", href: "/" },
  { name: "Control", href: "/control-final" },
  { name: "Dashboard", href: "/dashboard" },
  { name: "POS", href: "/pos-control" },
  { name: "History", href: "/history" },
  { name: "Accounting", href: "/accounting" },
  { name: "Payout", href: "/payout" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <div className="w-full bg-black border-b border-white/10">
      <div className="flex items-center gap-6 px-6 py-4">
        {/* Logo / Title */}
        <div className="text-white font-semibold text-xl">
          Churchill Control System
        </div>

        {/* Navigation */}
        <div className="flex gap-4">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-5 py-3 rounded-lg text-white text-xl transition ${
                  isActive
                    ? "bg-white/20"
                    : "bg-transparent hover:bg-white/10"
                }`}
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