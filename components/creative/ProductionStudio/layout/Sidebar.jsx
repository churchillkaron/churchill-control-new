"use client";

import ProjectTree from "../explorer/ProjectTree";

function Section({
  title,
  items = [],
}) {
  if (!items.length) return null;

  return (
    <section className="mb-8">

      <div className="mb-3 text-[11px] uppercase tracking-[0.28em] text-[#8f8f8f]">
        {title}
      </div>

      <div className="space-y-2">

        {items.map(item => (

          <button
            key={item.id}
            type="button"
            onClick={() =>
              item.onClick?.()
            }
            className={[
              "w-full rounded-xl border px-4 py-3 text-left transition",
              item.active
                ? "border-[#c8a96a]/40 bg-[#c8a96a]/10"
                : "border-white/5 bg-white/[0.03] hover:bg-white/[0.06]"
            ].join(" ")}
          >

            <div className="font-medium">
              {item.name}
            </div>

            {item.description && (
              <div className="mt-1 text-xs text-white/45">
                {item.description}
              </div>
            )}

          </button>

        ))}

      </div>

    </section>
  );
}

export default function Sidebar({
  runtime,
  editor,
}) {

  const workspaces =
    (runtime.workspaces || []).map(workspace => ({
      ...workspace,
      active:
        workspace.id ===
        editor.activeWorkspace,
      onClick: () =>
        editor.setActiveWorkspace(
          workspace.id
        ),
    }));

  return (
    <div className="h-full overflow-y-auto px-5 py-6">

      <ProjectTree
        runtime={runtime}
      />

      <Section
        title="Workspace"
        items={workspaces}
      />

    </div>
  );
}
