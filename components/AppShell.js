"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function getCookieValue(name) {
  if (typeof document === "undefined") return "";
  const value = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));

  return value ? decodeURIComponent(value.split("=")[1]) : "";
}

function normalizeRole(role) {
  return (role || "staff").toLowerCase().trim();
}

const roleMenus = {
  owner: [
    { name: "Dashboard", href: "/dashboard", icon: "/icons/dashboard.png" },
    { name: "POS", href: "/pos", icon: "/icons/pos.png" },
    { name: "Tables", href: "/tables", icon: "/icons/ai-process.png" },
    { name: "Kitchen", href: "/kitchen", icon: "/icons/production.png" },
    { name: "Production", href: "/production", icon: "/icons/production.png" },
    { name: "Waste", href: "/waste", icon: "/icons/action-alert.png" },
    { name: "Staff", href: "/staff", icon: "/icons/staff-salary.png" },
    { name: "Salary", href: "/salary", icon: "/icons/salary.png" },
    { name: "Accounting", href: "/accounting", icon: "/icons/accounting.png" },
    { name: "Payout", href: "/payout", icon: "/icons/finance-cost.png" },
    { name: "Settings", href: "/settings", icon: "/icons/integrations.png" },
  ],

  manager: [
    { name: "Dashboard", href: "/dashboard", icon: "/icons/dashboard.png" },
    { name: "POS", href: "/pos", icon: "/icons/pos.png" },
    { name: "Tables", href: "/tables", icon: "/icons/ai-process.png" },
    { name: "Kitchen", href: "/kitchen", icon: "/icons/production.png" },
    { name: "Production", href: "/production", icon: "/icons/production.png" },
    { name: "Waste", href: "/waste", icon: "/icons/action-alert.png" },
    { name: "Staff", href: "/staff", icon: "/icons/staff-salary.png" },
    { name: "Payout", href: "/payout", icon: "/icons/finance-cost.png" },
  ],

  production: [
    { name: "Production", href: "/production", icon: "/icons/production.png" },
    { name: "Kitchen", href: "/kitchen", icon: "/icons/production.png" },
    { name: "Waste", href: "/waste", icon: "/icons/action-alert.png" },
    { name: "Stock", href: "/stock", icon: "/icons/input-box.png" },
  ],

  accounting: [
    { name: "Accounting", href: "/accounting", icon: "/icons/accounting.png" },
    { name: "Payout", href: "/payout", icon: "/icons/finance-cost.png" },
    { name: "Salary", href: "/salary", icon: "/icons/salary.png" },
  ],

  staff: [
    { name: "Staff", href: "/staff", icon: "/icons/staff-salary.png" },
    { name: "Tasks", href: "/staff", icon: "/icons/action-lightning.png" },
    { name: "Salary", href: "/salary", icon: "/icons/salary.png" },
  ],
};

function getRoleMenu(role) {
  if (role === "general manager") return roleMenus.manager;
  return roleMenus[role] || roleMenus.staff;
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const [role, setRole] = useState("staff");

  useEffect(() => {
    setRole(normalizeRole(getCookieValue("role")));
  }, [pathname]);

  const menu = useMemo(() => getRoleMenu(role), [role]);
  const mobileMenu = menu.slice(0, 4);

  if (pathname === "/" || pathname.startsWith("/login")) {
    return children;
  }

  return (
    <div className="h-screen text-white relative bg-black overflow-hidden">
      {/* BACKGROUND */}
      <div
        className="fixed inset-0 bg-cover bg-center opacity-45"
        style={{ backgroundImage: "url('/bg-hero-control.jpg')" }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-black/65 via-black/45 to-black/80" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,122,0,0.22),transparent_35%)]" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.05),transparent_35%)]" />

      <div className="relative z-10 flex">
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden md:flex fixed left-0 top-0 h-screen w-56 flex-col px-6 py-8">
          <div className="text-xl font-bold mb-2 tracking-wide text-white/90">
            CONTROL
          </div>

          <div className="text-xs text-orange-300/80 mb-8 uppercase tracking-[0.18em]">
            {role}
          </div>

          <nav className="flex flex-col gap-2">
            {menu.map((item) => {
              const active = pathname === item.href;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                    active
                      ? "text-orange-400 font-medium"
                      : "text-white/50 hover:text-white hover:translate-x-1"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* MAIN */}
        <div className="flex-1 flex flex-col">
          {/* TOPBAR */}
          <header className="fixed top-0 left-0 md:left-56 right-0 h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/10 bg-black/30 backdrop-blur-xl z-50">
            <div className="flex items-center gap-4">
              <div className="text-lg font-semibold tracking-wide">
                {pathname.replace("/", "").toUpperCase() || "DASHBOARD"}
              </div>

              <div className="hidden md:block text-xs text-white/40">
                AI Control System
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-xs text-green-400 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                Live
              </div>

              <div className="px-3 py-1 rounded-lg text-xs bg-white/5 border border-white/10 capitalize">
                {role}
              </div>
            </div>
          </header>

          {/* CONTENT */}
          <main className="mt-16 md:ml-56 h-[calc(100vh-4rem)] overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
            {children}
          </main>
        </div>
      </div>

      {/* MOBILE BOTTOM NAV - ROLE BASED */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="glass-strong border-t border-white/10 flex justify-around py-2">
          {mobileMenu.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center text-xs transition ${
                  active ? "text-orange-400" : "text-white/60"
                }`}
              >
                <img
                  src={item.icon}
                  alt={item.name}
                  className={`h-5 w-5 mb-1 transition ${
                    active
                      ? "opacity-100 scale-110 drop-shadow-[0_0_10px_rgba(255,122,0,0.6)]"
                      : "opacity-60"
                  }`}
                />
                <span className="text-[10px]">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}