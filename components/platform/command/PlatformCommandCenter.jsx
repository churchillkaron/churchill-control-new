"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import {
  Command,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import {
  getActiveDomains,
} from "@/lib/platform/engine/domainEngine";

import AIExecutionPanel
  from "@/components/platform/command/AIExecutionPanel";

export default function PlatformCommandCenter() {

  const [open, setOpen] =
    useState(false);

  const [query, setQuery] =
    useState("");

  const domains =
    useMemo(
      () =>
        getActiveDomains(),
      []
    );

  const filtered =

    domains.filter(
      domain =>

        domain.title
          .toLowerCase()
          .includes(
            query.toLowerCase()
          )
    );

  return (

    <>

      {/* BUTTON */}

      <div className="fixed bottom-6 right-6 z-50">

        <button
          onClick={() =>
            setOpen(true)
          }
          className="group flex items-center gap-3 rounded-2xl border border-violet-500/20 bg-black/80 px-5 py-4 backdrop-blur-xl transition-all hover:border-violet-500/50 hover:bg-violet-500/10"
        >

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">

            <Search className="h-5 w-5 text-violet-400" />

          </div>

          <div className="text-left">

            <div className="text-sm font-medium text-white">
              Enterprise Command
            </div>

            <div className="text-xs text-white/40">
              Search enterprise modules, workflows and intelligence
            </div>

          </div>

          <div className="ml-3 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-violet-300">

            <Sparkles className="h-3 w-3" />

            Runtime

          </div>

        </button>

      </div>

      {/* MODAL */}

      {open && (

        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 p-10 backdrop-blur-xl">

          <div className="w-full max-w-3xl overflow-hidden rounded-[36px] border border-white/10 bg-black/90 shadow-2xl">

            {/* HEADER */}

            <div className="flex items-center justify-between border-b border-white/10 p-6">

              <div className="flex items-center gap-3">

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10">

                  <Command className="h-6 w-6 text-violet-400" />

                </div>

                <div>

                  <div className="text-xl font-light text-white">
                    AVANTIQO Command Center
                  </div>

                  <div className="text-sm text-white/40">
                    Enterprise runtime search and operational intelligence
                  </div>

                </div>

              </div>

              <button
                onClick={() =>
                  setOpen(false)
                }
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/50 transition-all hover:bg-red-500/10 hover:text-red-400"
              >

                <X className="h-5 w-5" />

              </button>

            </div>

            {/* SEARCH */}

            <div className="border-b border-white/10 p-6">

              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">

                <Search className="h-5 w-5 text-white/30" />

                <input
                  autoFocus
                  value={query}
                  onChange={e =>
                    setQuery(
                      e.target.value
                    )
                  }
                  placeholder="Search enterprise systems, workflows, intelligence and operations..."
                  className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
                />

              </div>

            </div>

            {/* RESULTS */}

            <div className="max-h-[420px] overflow-y-auto p-6">

              <div className="grid grid-cols-2 gap-4">

                {filtered.map(
                  domain => (

                    <Link
                      key={
                        domain.route
                      }
                      href={
                        domain.route
                      }
                      onClick={() =>
                        setOpen(false)
                      }
                      className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-violet-500/40 hover:bg-violet-500/5"
                    >

                      <div className="mb-3 flex items-center justify-between">

                        <div className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-violet-400">

                          {
                            domain.category
                          }

                        </div>

                        <Sparkles className="h-4 w-4 text-white/20 group-hover:text-violet-400" />

                      </div>

                      <div className="mb-2 text-2xl font-light text-white">

                        {
                          domain.title
                        }

                      </div>

                      <div className="text-sm leading-relaxed text-white/40">

                        {
                          domain.description
                        }

                      </div>

                    </Link>

                  )
                )}

              </div>

            </div>

            <AIExecutionPanel />

          </div>

        </div>

      )}

    </>

  );

}
