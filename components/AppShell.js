"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menu = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "POS", href: "/pos" },
  { name: "Kitchen", href: "/kitchen" },
  { name: "Tables", href: "/tables" },
  { name: "Production", href: "/production" },
  { name: "Store", href: "/store" },
  { name: "Waste", href: "/waste" },
  { name: "Control", href: "/control" },
  { name: "Control Final", href: "/control-final" },
  { name: "History", href: "/history" },
  { name: "Staff", href: "/staff" },
  { name: "Accounting", href: "/accounting" },
  { name: "Payout", href: "/payout" },
  { name: "Settings", href: "/settings" },
];

export default function AppShell({ children }) {
  const pathname = usePathname();

  // 🔒 Do NOT wrap landing/login
  if (pathname === "/" || pathname.startsWith("/login")) {
    return children;
  }

  return (
    <div className="min-h-screen text-white relative bg-black overflow-x-hidden">

      {/* 🔥 BACKGROUND (FIXED + BEHIND EVERYTHING) */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center opacity-45"
        style={{ backgroundImage: "url('/bg-hero-control.jpg')" }}
      />

      <div className="fixed inset-0 z-0 bg-gradient-to-b from-black/65 via-black/45 to-black/80" />

      <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,122,0,0.22),transparent_35%)]" />

      <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.05),transparent_35%)]" />

      {/* 🔥 CONTENT (ABOVE BACKGROUND) */}
      <div className="relative z-10 flex">

        {/* SIDEBAR (DESKTOP ONLY) */}
        <aside className="hidden md:block w-64 min-h-screen border-r border-white/10 bg-black/40 backdrop-blur-xl p-5">

          <div className="text-xl font-bold mb-8 tracking-wide">
            CONTROL
          </div>

          <nav className="space-y-2">
            {menu.map((item) => {
              const active = pathname === item.href;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`block px-4 py-2 rounded-xl text-sm transition ${
                    active
                      ? "bg-orange-500/15 border border-orange-500/30 shadow-[0_0_15px_rgba(255,122,0,0.2)] text-white"
                      : "text-white/70 hover:bg-white/5 hover:text-white hover:translate-x-1"
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
          <header className="h-16 flex items-center justify-between px-6 border-b border-white/10 bg-black/30 backdrop-blur-xl">

            {/* LEFT */}
            <div className="flex items-center gap-4">
              <div className="text-lg font-semibold tracking-wide">
                {pathname.replace("/", "").toUpperCase() || "DASHBOARD"}
              </div>

              <div className="hidden md:block text-xs text-white/50">
                AI Control System
              </div>
            </div>

            {/* RIGHT */}
            <div className="flex items-center gap-4">

              {/* LIVE STATUS */}
              <div className="text-xs text-green-400 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.6)]"></span>
                Live
              </div>

              {/* USER */}
              <div className="glass px-3 py-1 rounded-lg text-xs">
                Owner
              </div>

            </div>
          </header>

          {/* PAGE CONTENT */}
          <main className="p-6 pb-24 md:pb-6">
            {children}
          </main>

        </div>
      </div>

      {/* 🔥 MOBILE BOTTOM NAV */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="glass-strong border-t border-white/10 flex justify-around py-2">

          {[
            { name: "Home", href: "/dashboard", icon: "/icons/dashboard.png" },
            { name: "POS", href: "/pos", icon: "/icons/pos.png" },
            { name: "Kitchen", href: "/kitchen", icon: "/icons/production.png" },
            { name: "Prod", href: "/production", icon: "/icons/production.png" },
            { name: "Control", href: "/control", icon: "/icons/ai-process.png" },
          ].map((item) => {
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