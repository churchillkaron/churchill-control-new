"use client";

import { useWorkspaceRuntime } from "@/app/providers/WorkspaceRuntimeProvider";


export default function WorkspaceTopBar() {
  const {
    runtime,
    organization,
    navigation,
    resolvedRuntime,
    ready,
  } = useWorkspaceRuntime();

  const companyName =
    organization?.name ||
    runtime?.activeOrganization?.name ||
    "Workspace";

  const userName =
    runtime?.access?.staff?.name ||
    runtime?.access?.staff?.email ||
    "User";

  const activeSection = "OPERATIONS";

  if (!ready) {
    return (
      <div className="px-6 py-3 text-white/50 text-sm">
        Loading workspace...
      </div>
    );
  }

  return (
    <header className="border-b border-white/10 bg-black">
      <div className="flex items-center justify-between px-8 py-5">

        <div className="min-w-[280px]">
          <div className="text-4xl font-extralight tracking-[-0.03em] text-white">
            {companyName}
          </div>

          <div className="mt-2 text-[11px] uppercase tracking-[0.35em] text-white/45">
            Synthetic Intelligence OS
          </div>

          <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-[#D6A66A]">
            Powered by Avantiqo
          </div>

        </div>

        <nav className="hidden lg:flex items-center gap-12">
          {(navigation?.executive || []).map((item) => (
            <button
              key={item.id}
              className={
                item.name?.toUpperCase() === activeSection
                  ? "text-xs tracking-[0.28em] text-white border-b border-white pb-1"
                  : "text-xs tracking-[0.28em] text-white/55 hover:text-white transition"
              }
            >
              {item.name?.toUpperCase()}
            </button>
          ))}
        </nav>

        <div className="text-right">
          <button className="text-base font-light text-white hover:text-[#D6A66A] transition">
            {userName} ▾
          </button>
        </div>

      </div>
    </header>
  );
}
