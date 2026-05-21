"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  BriefcaseBusiness,
  Brush,
  Map,
  ShieldCheck,
  Users,
} from "lucide-react";

import {
  SYSTEM_REGISTRY,
} from "@/lib/shared/architecture/systemRegistry";

const ICONS = {

  operations:
    Activity,

  business:
    BriefcaseBusiness,

  staff:
    Users,

  creative:
    Brush,

  insights:
    Map,

  intelligence:
    Brain,

  governance:
    ShieldCheck,

};

export default function SystemMapPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 text-xs uppercase tracking-[0.3em] text-violet-400">

          Churchill Architecture

        </div>

        <h1 className="mb-4 text-6xl font-light">

          System Map

        </h1>

        <p className="max-w-3xl text-lg text-white/50">

          Master overview of Churchill domains, platform structure,
          duplicate systems and architectural organization.

        </p>

      </div>

      <div className="grid grid-cols-2 gap-6">

        {Object.entries(
          SYSTEM_REGISTRY
        ).map(
          ([key, area]) => {

            const Icon =
              ICONS[key] ||
              Map;

            return (

              <div
                key={key}
                className="rounded-[36px] border border-white/10 bg-white/[0.03] p-8"
              >

                <div className="mb-8 flex items-center justify-between">

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-500/10">

                    <Icon className="h-8 w-8 text-violet-400" />

                  </div>

                  <div className="rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-violet-400">

                    {
                      area.domains.length
                    }
                    {" "}
                    domains

                  </div>

                </div>

                <div className="mb-2 text-4xl font-light">

                  {
                    area.title
                  }

                </div>

                <div className="mb-6 text-white/40">

                  {
                    area.owner
                  }

                </div>

                <div className="grid grid-cols-2 gap-3">

                  {area.domains.map(
                    (domain) => {

                      const isLegacy =

                        domain.status ===
                        "LEGACY";

                      return (

                        <Link
                          key={
                            domain.name
                          }
                          href={`/${
                            domain.name.split("/")[0]
                          }`}
                          className={`
                            group rounded-2xl border p-4 transition-all

                            ${
                              isLegacy

                                ? "border-red-500/20 bg-red-500/5"

                                : "border-white/10 bg-black/30 hover:border-violet-500/40 hover:bg-violet-500/5"
                            }
                          `}
                        >

                          <div className="mb-3 flex items-center justify-between">

                            <div className="text-white/80">

                              {
                                domain.name
                              }

                            </div>

                            <ArrowRight
                              className={`
                                h-4 w-4 transition-all

                                ${
                                  isLegacy

                                    ? "text-red-400"

                                    : "text-white/20 group-hover:translate-x-1 group-hover:text-violet-400"
                                }
                              `}
                            />

                          </div>

                          <div className="mb-3 flex flex-wrap gap-2">

                            <div
                              className={`
                                rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]

                                ${
                                  isLegacy

                                    ? "bg-red-500/10 text-red-400"

                                    : "bg-emerald-500/10 text-emerald-400"
                                }
                              `}
                            >

                              {
                                domain.status
                              }

                            </div>

                            <div className="rounded-full bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/40">

                              {
                                domain.type
                              }

                            </div>

                          </div>

                          {domain.mergeInto && (

                            <div className="flex items-center gap-2 text-xs text-white/40">

                              <AlertTriangle className="h-3 w-3 text-red-400" />

                              Merge into:
                              {" "}

                              {
                                domain.mergeInto
                              }

                            </div>

                          )}

                        </Link>

                      );

                    }
                  )}

                </div>

              </div>

            );

          }
        )}

      </div>

    </main>

  );

}
