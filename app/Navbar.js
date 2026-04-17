"use client";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Control", path: "/control-final" },
    { name: "POS", path: "/pos" },
    { name: "History", path: "/history" },

    { name: "Dashboard", path: "/dashboard" },
    { name: "Staff Control", path: "/staff-control" },

    { name: "Staff", path: "/staff" },

    { name: "Accounting", path: "/accounting" },
    { name: "Payout", path: "/payout" },
  ];

  return (
    <div className="fixed top-0 left-0 w-full z-50">
      <div className="max-w-7xl mx-auto px-6 pt-4">
        
        {/* Glass Container */}
        <div className="flex items-center justify-between px-6 py-3 rounded-2xl 
          bg-white/5 backdrop-blur-xl 
          border border-white/10 
          shadow-[0_8px_30px_rgba(0,0,0,0.6)]">

          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="text-orange-500 font-bold text-xl">CC</span>
            <span className="text-white text-lg font-medium tracking-wide">
              Churchill
            </span>
          </div>

          {/* Navigation */}
          <div className="hidden md:flex gap-2">
            {navItems.map((item) => {
              const isActive = pathname === item.path;

              return (
                <Link key={item.name} href={item.path}>
                  <div
                    className={`px-4 py-2 rounded-xl text-sm transition-all duration-200 cursor-pointer
                    ${
                      isActive
                        ? "bg-orange-500 text-black font-semibold shadow-lg"
                        : "text-white/80 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {item.name}
                  </div>
                </Link>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
