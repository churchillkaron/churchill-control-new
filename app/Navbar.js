"use client";

import { usePathname, useRouter } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

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
    <div
      className="
      fixed top-4 left-1/2 -translate-x-1/2
      w-[95%] max-w-7xl
      bg-white/10 backdrop-blur-xl
      border border-white/10
      rounded-2xl
      px-6 py-3
      flex justify-between items-center
      shadow-[0_10px_40px_rgba(0,0,0,0.6)]
      z-50
    "
    >
      {/* LOGO */}
      <div
        onClick={() => router.push("/dashboard")}
        className="flex items-center gap-2 cursor-pointer"
      >
        <span className="text-orange-500 font-bold text-lg">CC</span>
        <span className="text-white/80">Churchill</span>
      </div>

      {/* NAV ITEMS */}
      <div className="flex gap-2">
        {navItems.map((item) => {
          const isActive = pathname === item.path;

          return (
            <button
              key={item.name}
              onClick={() => router.push(item.path)}
              className={`
                px-4 py-2 rounded-xl text-sm transition
                ${
                  isActive
                    ? "bg-orange-500 text-white"
                    : "text-white/70 hover:bg-white/10"
                }
              `}
            >
              {item.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}