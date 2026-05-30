"use client";

import Link
from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  ArrowUpRight,
  Building2,
} from "lucide-react";

export default function WorkspacePage() {

  const [workspace, setWorkspace] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    async function loadWorkspace() {

      try {

        const response =
          await fetch(
            "/api/workspace"
          );

        const data =
          await response.json();

        console.log(
          "WORKSPACE:",
          data
        );

        setWorkspace(data);

      } catch (error) {

        console.error(error);

      } finally {

        setLoading(false);

      }

    }

    loadWorkspace();

  }, []);

  if (loading) {

    return (

      <main className="min-h-screen bg-[#030712] text-white p-10">

        <div className="animate-pulse text-white/40">
          Loading workspace...
        </div>

      </main>

    );

  }

  return (

    <main className="min-h-screen bg-[#030712] text-white p-10">

      <div className="mx-auto max-w-7xl">

        {/* ORGANIZATIONS */}

        <section className="mb-16">

          <div className="mb-6 flex items-center gap-3">

            <Building2 className="h-5 w-5 text-[#8B5CF6]" />

            <h2 className="text-xl font-light">
              Organizations
            </h2>

          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

            {(workspace?.organizations || []).map((organization) => (

              <Link
                key={organization.id}
                href={`/workspace/${organization.id}`}
              >

                <div className="group rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-[#8B5CF6]/40 hover:bg-white/[0.05]">

                  <div className="mb-6 flex items-center justify-between">

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">

                      <Building2 className="h-5 w-5 text-[#8B5CF6]" />

                    </div>

                    <ArrowUpRight className="h-5 w-5 text-white/30 transition group-hover:text-[#8B5CF6]" />

                  </div>

                  <p className="text-lg">
                    {organization.name}
                  </p>

                  <p className="mt-2 text-sm text-white/40">
                    {organization.organization_type}
                  </p>

                </div>

              </Link>

            ))}

          </div>

        </section>

        {/* MODULES */}

        <section>

          <div className="mb-6 flex items-center gap-3">

            <Building2 className="h-5 w-5 text-[#8B5CF6]" />

            <h2 className="text-xl font-light">
              Platform Modules
            </h2>

          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

            {(workspace?.modules || []).map((module) => (

              <div
                key={module.id}
                className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"
              >

                <p className="text-lg">
                  {module.name}
                </p>

                <p className="mt-2 text-sm text-white/40">
                  {module.category}
                </p>

              </div>

            ))}

          </div>

        </section>

      </div>

    </main>

  );

}
