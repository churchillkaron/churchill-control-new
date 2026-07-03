"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import WorkspaceHeader
from "@/components/workspace/WorkspaceHeader";

export const dynamic = "force-dynamic";

export default function CreativeProjectsPage() {

  const { organizationId } =
    useParams();

  const [projects, setProjects] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    load();

  }, []);

  async function load() {

    try {

      const res =
        await fetch(
          `/api/creative/projects?organizationId=${organizationId}`,
          {
            cache: "no-store",
          }
        );

      const json =
        await res.json();

      setProjects(
        json.data || []
      );

    } finally {

      setLoading(false);

    }

  }

  return (
    <>

      <WorkspaceHeader
        workspace="Design Studio"
        title="Creative Projects"
        description="Manage AI creative productions."
      />

      <div className="space-y-6">

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">

          <button
            className="rounded-xl bg-[#D6A66A] px-5 py-3 font-medium text-black"
          >
            + New Project
          </button>

        </div>

        {loading ? (

          <div className="text-white/60">
            Loading...
          </div>

        ) : (

          <div className="grid gap-4">

            {projects.map(project => (

              <div
                key={project.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >

                <div className="flex justify-between">

                  <div>

                    <h3 className="text-xl text-white">

                      {project.name}

                    </h3>

                    <div className="mt-2 text-sm text-white/50">

                      {project.production_type}

                    </div>

                  </div>

                  <div className="text-sm text-[#D6A66A]">

                    {project.status}

                  </div>

                </div>

              </div>

            ))}

          </div>

        )}

      </div>

    </>
  );

}
