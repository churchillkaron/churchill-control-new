"use client";

import {
  usePathname,
} from "next/navigation";

import {
  ChevronRight,
  Activity,
} from "lucide-react";

export default function PlatformHeader() {

  const pathname =
    usePathname();

  const segments =

    pathname
      .split("/")
      .filter(Boolean);

  return (

    <header className="sticky top-0 z-40 flex h-[76px] items-center justify-between border-b border-white/10 bg-black/70 px-8 backdrop-blur-xl">

      {/* LEFT */}

      <div>

        <div className="mb-1 text-xs uppercase tracking-[0.28em] text-violet-400">

          AVANTIQO ENTERPRISE RUNTIME

        </div>

        <div className="flex items-center gap-2 text-sm text-white/40">

          {segments.length === 0 && (

            <div className="capitalize">
              Dashboard
            </div>

          )}

          {segments.map(
            (
              segment,
              index
            ) => (

              <div
                key={segment}
                className="flex items-center gap-2"
              >

                <div className="capitalize">

                  {
                    segment.replaceAll(
                      "-",
                      " "
                    )
                  }

                </div>

                {index <
                  segments.length - 1 && (

                  <ChevronRight className="h-4 w-4 text-white/20" />

                )}

              </div>

            )
          )}

        </div>

      </div>

      {/* RIGHT */}

      <div className="flex items-center gap-4">

        <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-emerald-400">

          <Activity className="h-3 w-3" />

          Runtime Active

        </div>

      </div>

    </header>

  );

}
