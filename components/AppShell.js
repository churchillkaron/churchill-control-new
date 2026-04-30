"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const roleMenus = {
  staff: {
    foh: [
      { name: "Home", href: "/staff" },
      { name: "POS", href: "/pos" },
      { name: "Tables", href: "/tables" },
      { name: "Kitchen", href: "/kitchen" },
    ],
    kitchen: [
      { name: "Home", href: "/staff" },
      { name: "Kitchen", href: "/kitchen" },
      { name: "Production", href: "/production" },
    ],
    bar: [
      { name: "Home", href: "/staff" },
      { name: "POS", href: "/pos" },
      { name: "Tables", href: "/tables" },
    ],
  },

  owner: [
    { name: "Dashboard", href: "/dashboard" },
    { name: "POS", href: "/pos" },
    { name: "Tables", href: "/tables" },
    { name: "Kitchen", href: "/kitchen" },
    { name: "Production", href: "/production" },
    { name: "Accounting", href: "/accounting" },
  ],

  manager: [
    { name: "home", href: "/management" },
    { name: "Dashboard", href: "/dashboard" },
    { name: "POS", href: "/pos" },
    { name: "Tables", href: "/tables" },
    { name: "Kitchen", href: "/kitchen" },
  ],
};

export default function AppShell({ children }) {
  const pathname = usePathname();

  const [role, setRole] = useState("staff");
  const [position, setPosition] = useState("foh");

  // 🔥 LOAD USER FROM DB
  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) return;

      const { data: userData } = await supabase
        .from("staff_accounts")
        .select("role, position")
        .eq("auth_user_id", data.user.id)
        .single();

      if (userData) {
        setRole((userData.role || "staff").toLowerCase());
        setPosition((userData.position || "foh").toLowerCase());
      }
    };

    loadUser();
  }, []);

  // 🔥 BUILD MENU
  let menu = [];

  if (role === "staff") {
    menu = roleMenus.staff[position] || roleMenus.staff.foh;
  } else {
    menu = roleMenus[role] || [];
  }

  const mobileMenu = menu.slice(0, 4);

  // 🔥 DO NOT WRAP LOGIN PAGE
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

      <div className="relative z-10 flex">

        {/* SIDEBAR */}
        <aside className="hidden md:flex fixed left-0 top-0 h-screen w-56 flex-col px-6 py-8">
          <div className="text-xl font-bold mb-4">CONTROL</div>

          <div className="text-xs text-orange-300 mb-6 uppercase">
            {role} / {position}
          </div>

          <nav className="flex flex-col gap-2">
            {menu.map((item) => {
              const active = pathname === item.href;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`px-3 py-2 rounded-lg text-sm transition ${
                    active
                      ? "text-orange-400"
                      : "text-white/50 hover:text-white"
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
          <header className="fixed top-0 left-0 md:left-56 right-0 h-16 flex items-center justify-between px-6 border-b border-white/10 bg-black/30 backdrop-blur-xl z-50">
            <div className="text-lg font-semibold">
              {pathname.replace("/", "").toUpperCase() || "DASHBOARD"}
            </div>

            <div className="text-xs text-green-400 flex items-center gap-2">
              ● Live
            </div>
          </header>

          {/* CONTENT */}
          <main className="mt-16 md:ml-56 h-[calc(100vh-4rem)] overflow-y-auto p-6 pb-24">
            {children}
          </main>
        </div>
      </div>

      {/* MOBILE NAV */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="flex justify-around py-2 bg-black/80 border-t border-white/10">
          {mobileMenu.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center text-xs ${
                  active ? "text-orange-400" : "text-white/60"
                }`}
              >
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </div>

    </div>
  );
}