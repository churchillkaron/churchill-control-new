"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Control", href: "/control-final" },
    { name: "POS", href: "/pos" },
    { name: "Orders", href: "/pos-control" },
    { name: "Kitchen", href: "/kitchen" },
    { name: "Staff", href: "/staff" },
    { name: "Staff Control", href: "/staff-control" },
    { name: "History", href: "/history" },
    { name: "Accounting", href: "/accounting" },
    { name: "Payout", href: "/payout" },
  ];

  const switchUser = () => {
    localStorage.clear();
    router.push("/");
  };

  return (
    <div className="fixed top-0 left-0 w-full z-50 bg-black/40 backdrop-blur-xl border-b border-white/10">
      <div className="flex justify-between items-center px-6 h-16 max-w-7xl mx-auto">

        <div className="flex items-center gap-2">
          <span className="text-[#ff7a00] font-bold">CC</span>
          <span className="text-white/80">CHURCHILL</span>
        </div>

        <div className="flex gap-2 overflow-x-auto">

          {navItems.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "bg-[#ff7a00] text-black px-3 py-2 rounded-lg"
                    : "text-white/60 px-3 py-2 hover:text-white"
                }
              >
                {item.name}
              </Link>
            );
          })}

          <button
            onClick={switchUser}
            className="ml-4 text-red-400"
          >
            Switch User
          </button>

        </div>
      </div>
    </div>
  );
}