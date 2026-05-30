"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CalendarDays,
  ClipboardList,
  Wallet,
  User,
} from "lucide-react";

export default function WorkforceLayout({ children }) {
  const pathname = usePathname();

  const navItems = [
    {
      label: "Home",
      href: "/workforce",
      icon: Home,
    },
    {
      label: "Tasks",
      href: "/workforce/tasks",
      icon: ClipboardList,
    },
    {
      label: "Payroll",
      href: "/workforce/payroll",
      icon: Wallet,
    },
    {
      label: "Upload",
      href: "/workforce/upload",
      icon: CalendarDays,
    },
    {
      label: "Me",
      href: "/workforce/profile",
      icon: User,
    },
  ];

  return (
    <div className="min-h-screen bg-[#030712] text-white">

      <div className="pointer-events-none fixed inset-0">
        <div className="absolute right-0 top-0 h-[500px] w-[500px] rounded-full bg-violet-500/10 blur-[140px]" />
        <div className="absolute left-0 bottom-0 h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-[140px]" />
      </div>

      <main className="relative z-10 mx-auto min-h-screen w-full max-w-lg px-4 pb-32 pt-5">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4">
        <div className="mx-auto max-w-lg rounded-[34px] border border-white/10 bg-white/[0.03] p-2 backdrop-blur-3xl">

          <div className="grid grid-cols-5 gap-1">

            {navItems.map((item) => {
              const Icon = item.icon;

              const active =
                pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center gap-1 rounded-[20px] px-2 py-2"
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-[18px] transition-all duration-300 ${
                      active
                        ? "bg-violet-500/20 border border-violet-400/40 text-white"
                        : "bg-white/[0.04] text-white/60"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  <div
                    className={`text-[10px] font-semibold ${
                      active
                        ? "text-white"
                        : "text-white/40"
                    }`}
                  >
                    {item.label}
                  </div>
                </Link>
              );
            })}

          </div>

        </div>
      </nav>

    </div>
  );
}
