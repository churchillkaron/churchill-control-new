"use client";

import { useMemo } from "react";

import ProjectTree from "../explorer/ProjectTree";

function Section({
  title,
  items = [],
}) {

  if (!items.length) {
    return null;
  }

  return (

    <div className="mb-8">

      <div className="mb-3 text-[11px] uppercase tracking-[0.28em] text-white/35">
        {title}
      </div>

      <div className="space-y-1">

        {items.map((item) => (

          <a
            key={item.id}
            onClick={(e) => { e.preventDefault(); editor?.setActiveWorkspace?.(item.id); }}
            className={[
              "block rounded-xl border px-4 py-3 transition",
              item.active
                ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                : "border-white/5 bg-white/[0.03] text-white/65 hover:bg-white/[0.08]",
            ].join(" ")}
          >

            <div className="font-medium">
              {item.name}
            </div>

            {item.description && (

              <div className="mt-1 text-xs text-white/35">
                {item.description}
              </div>

            )}

          </a>

        ))}

      </div>

    </div>

  );

}

export default function Sidebar({ editor, 
  runtime,
}) {

  const projects =
    runtime.projectRuntime?.projects || [];

  const active =
    runtime.projectRuntime?.project;

  const explorer =
    useMemo(() => {

      return projects.map((project) => ({

        id:
          project.id,

        href:
          `/workspace/${runtime.organizationId}/commercial/design/production/${project.id}`,

        name:
          project.name || "Untitled Project",

        description:
          project.production_type ||
          "Creative Project",

        active:
          project.id === active?.id,

      }));

    }, [
      projects,
      active,
      runtime.organizationId,
    ]);

  return (

    <aside className="overflow-auto border-r border-white/10 bg-[#0b0f18]">

      <div className="p-6">

        <ProjectTree
          runtime={runtime}
        />

        <Section
          title="Projects"
          items={explorer}
        />

        <Section
          title="Workspace"
          items={runtime.workspaces || []}
        />

      </div>

    </aside>

  );

}
