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
    <div className="fixed left-1/2 top-4 z-50 w-[95%] max-w-7xl -translate-x-1/2">
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-6 py-3 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2"
        >
          <span className="text-lg font-bold text-orange-500">CC</span>
          <span className="text-lg text-white/90">Churchill</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => {
            const active = pathname === item.path;

            return (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-orange-500 text-black shadow-[0_8px_24px_rgba(255,122,0,0.28)]"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}