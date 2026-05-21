"use client";

import Link from "next/link";

import {
  ArrowRight,
} from "lucide-react";

export default function PlatformSectionPage({
  title,
  subtitle,
  domains = [],
}) {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 text-xs uppercase tracking-[0.3em] text-violet-400">

          Churchill Platform

        </div>

        <h1 className="mb-4 text-6xl font-light">

          {title}

        </h1>

        <p className="max-w-3xl text-lg text-white/50">

          {subtitle}

        </p>

      </div>

      <div className="grid grid-cols-3 gap-6">

        {domains.map(
          domain => (

            <Link
              key={domain.name}
              href={`/${
                domain.name.split("/")[0]
              }`}
              className={`
                group rounded-[32px] border p-7 transition-all

                ${
                  domain.status === "DUPLICATE"

                    ? "border-red-500/20 bg-red-500/5"

                    : "border-white/10 bg-white/[0.03] hover:border-violet-500/40 hover:bg-violet-500/5"
                }
              `}
            >

              <div className="mb-8 flex items-center justify-between">

                <div
                  className={`
                    rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]

                    ${
                      domain.status === "DUPLICATE"

                        ? "bg-red-500/10 text-red-400"

                        : "bg-emerald-500/10 text-emerald-400"
                    }
                  `}
                >

                  {domain.status}

                </div>

                <ArrowRight
                  className={`
                    h-5 w-5 transition-all

                    ${
                      domain.status === "DUPLICATE"

                        ? "text-red-400"

                        : "text-white/20 group-hover:translate-x-1 group-hover:text-violet-400"
                    }
                  `}
                />

              </div>

              <div className="mb-3 text-3xl font-light text-white">

                {domain.name}

              </div>

              <div className="text-sm uppercase tracking-[0.2em] text-white/30">

                {domain.type}

              </div>

            </Link>

          )
        )}

      </div>

    </main>

  );

}
