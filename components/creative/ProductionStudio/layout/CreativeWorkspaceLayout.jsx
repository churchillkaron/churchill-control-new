"use client";

export default function CreativeWorkspaceLayout({
  header,
  sidebar,
  canvas,
  inspector,
  dock,
}) {
  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[#050505] text-white">
      <div className="shrink-0">
        {header}
      </div>

      <section className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-[240px] shrink-0 overflow-y-auto border-r border-white/10 bg-[#080808]">
          {sidebar}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#050505]">
          <div className="min-h-0 flex-1 overflow-hidden">
            {canvas}
          </div>

          <div className="h-[220px] shrink-0 overflow-hidden border-t border-white/10">
            {dock}
          </div>
        </section>

        <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-white/10 bg-[#080808]">
          {inspector}
        </aside>
      </section>
    </main>
  );
}
