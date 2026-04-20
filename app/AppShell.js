"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppShell({ children }) {
  const pathname = usePathname();

  const navItems = [
    { name: "POS", href: "/pos" },
    { name: "Kitchen", href: "/kitchen" },
    { name: "Tables", href: "/tables" },
    { name: "Control", href: "/control-final" },
  ];

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* Background */}
      <div className="absolute inset-0">
        <img
          src="/bg-hero-control.jpg"
          alt="background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">

        {/* CONTENT */}
        <div className="p-6 flex-1 pb-24">
          {children}
        </div>

        {/* 🔥 FORCE VISIBLE NAV (for debugging) */}
        <div className="fixed bottom-0 left-0 right-0 bg-black/90 border-t border-white/10 flex justify-around py-4">

          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm ${
                pathname === item.href
                  ? "text-[#ff7a00]"
                  : "text-white/60"
              }`}
            >
              {item.name}
            </Link>
          ))}

        </div>

      </div>

    </div>
  );
}