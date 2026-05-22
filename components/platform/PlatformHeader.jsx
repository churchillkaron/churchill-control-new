"use client";

import { Bell } from "lucide-react";

import { usePathname } from "next/navigation";

function getTitle(pathname) {

  if (!pathname) {
    return "Dashboard";
  }

  const clean =
    pathname
      .replace("/", "")
      .split("/")[0];

  if (!clean) {
    return "Dashboard";
  }

  return clean
    .replaceAll("-", " ")
    .replace(
      /\b\w/g,
      l => l.toUpperCase()
    );

}

export default function PlatformHeader() {

  const pathname =
    usePathname();

  const title =
    getTitle(pathname);

  return (

    <header className="sticky top-0 z-40 flex h-[88px] items-center justify-between border-b border-white/10 bg-black/60 px-8 backdrop-blur-2xl">

      <div>

        <div className="text-[11px] tracking-[0.35em] text-violet-400">

          AVANTIQO ENTERPRISE

        </div>

        <h1
          className="mt-1 text-[30px] leading-none text-white"
          style={{
            fontWeight: 250,
            letterSpacing: "-0.06em",
          }}
        >

          {title}

        </h1>

      </div>

      <div className="flex items-center gap-4">

        <div className="hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 md:flex">

          <div className="flex items-center gap-2">

            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />

            <div className="text-sm text-emerald-300">

              Enterprise Runtime Active

            </div>

          </div>

        </div>

        <button className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/70 transition-all hover:bg-white/[0.08] hover:text-white">

          <Bell className="h-5 w-5" />

        </button>

        <div className="flex h-12 min-w-[120px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white/70">

          OWNER

        </div>

      </div>

    </header>

  );

}
