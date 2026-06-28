"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import {
  Bot,
  Camera,
  Flame,
  Home,
  Sparkles,
  Star,
  Wallet,
} from "lucide-react";

export default function StaffLayout({
  children,
}) {

  const pathname =
    usePathname();

  const [runtime, setRuntime] =
    useState(null);

  useEffect(() => {

    async function loadRuntime() {

      try {

        const response =
          await fetch("/api/staff");

        const data =
          await response.json();

        setRuntime(data);

      } catch (err) {

        console.error(err);

      }

    }

    loadRuntime();

    const interval =
      setInterval(loadRuntime, 15000);

    return () =>
      clearInterval(interval);

  }, []);

  const navItems = [

    {
      label: "POS",
      icon: Home,
      href: "/operations/pos",
    },

    {
      label: "Tables",
      icon: Sparkles,
      href: "/operations/tables",
    },

    {
      label: "Payments",
      icon: Wallet,
      href: "/payments",
    },

    {
      label: "AI",
      icon: Bot,
      href: "/staff",
    },

    {
      label: "Upload",
      icon: Camera,
      href: "/staff/upload",
    },

  ];

  return (

    <div className="relative min-h-screen overflow-hidden bg-black text-white">

      <div className="fixed inset-0 z-0 overflow-hidden">

        <div className="absolute left-[-120px] top-[-180px] h-[520px] w-[520px] rounded-full bg-fuchsia-500/20 blur-[180px]" />

        <div className="absolute bottom-[-240px] right-[-120px] h-[560px] w-[560px] rounded-full bg-violet-500/20 blur-[180px]" />

        <div className="absolute left-[30%] top-[40%] h-[320px] w-[320px] rounded-full bg-cyan-500/10 blur-[140px]" />

      </div>

      <header className="sticky top-2 z-50 px-4 pb-3 pt-2 backdrop-blur-xl">

        <div className="mx-auto max-w-[720px] overflow-hidden rounded-[28px] border border-white/10 bg-black/60 shadow-[0_0_80px_rgba(217,70,239,0.2)] backdrop-blur-3xl">

          <div className="h-[2px] bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400" />

          <div className="p-4">

            <div className="flex items-center justify-between gap-4">

              <div>

                <div className="text-[9px] uppercase tracking-[0.35em] text-fuchsia-300">
                  Powered by Avantiqo
                </div>

                <div className="mt-2 text-xl font-black">
                  Churchill Runtime
                </div>

                <div className="mt-2 text-xs text-white/45">
                  Luxury hospitality operating system
                </div>

              </div>

              <div className="flex items-center gap-4">

                <Link
                  href="/staff/identity"
                  className="relative"
                >

                  <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 opacity-70 blur-md" />

                  <img
                    src={
                      runtime?.staff?.profile_picture ||
                      "https://ui-avatars.com/api/?name=Staff"
                    }
                    className="relative h-12 w-12 rounded-full border-2 border-white object-cover"
                  />

                </Link>

              </div>

            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">

              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3">

                <div className="text-[9px] uppercase tracking-[0.2em] text-white/35">
                  Stars
                </div>

                <div className="mt-2 flex items-center gap-2 text-lg font-bold text-amber-300">

                  <Star className="h-4 w-4" />

                  94

                </div>

              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3">

                <div className="text-[9px] uppercase tracking-[0.2em] text-white/35">
                  Pulse
                </div>

                <div className="mt-2 flex items-center gap-2 text-sm font-bold text-fuchsia-300">

                  <Flame className="h-4 w-4" />

                  HIGH

                </div>

              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3">

                <div className="text-[9px] uppercase tracking-[0.2em] text-white/35">
                  AI Mood
                </div>

                <div className="mt-2 flex items-center gap-2 text-sm font-bold text-cyan-300">

                  <Sparkles className="h-4 w-4" />

                  ELITE

                </div>

              </div>

            </div>

          </div>

        </div>

      </header>

      <main className="relative z-20 mx-auto w-full max-w-4xl px-4 pb-48 pt-[20px]">

        {children}

      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 pb-4">

        <div className="mx-auto max-w-[720px] px-4">

          <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black/70 shadow-[0_0_40px_rgba(168,85,247,0.18)] backdrop-blur-3xl">

            <div className="grid grid-cols-5 gap-1 p-2">

              {navItems.map((item) => {

                const Icon =
                  item.icon;

                const active =
                  pathname ===
                  item.href;

                return (

                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex flex-col items-center gap-1 py-2"
                  >

                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-all ${
                        active
                          ? "bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 shadow-[0_0_40px_rgba(217,70,239,0.6)]"
                          : "bg-white/[0.05]"
                      }`}
                    >

                      <Icon className="h-5 w-5 text-white" />

                    </div>

                    <div
                      className={`text-[9px] ${
                        active
                          ? "text-white"
                          : "text-white/35"
                      }`}
                    >

                      {item.label}

                    </div>

                  </Link>

                );

              })}

            </div>

          </div>

        </div>

      </nav>

    </div>

  );

}
