"use client";

export default function CreativeWorkspaceLayout({
  header,
  sidebar,
  canvas,
  inspector,
  dock,
  showInspector = true,
  showDock = true,
}) {
  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[#050505] text-white">
      <div className="shrink-0">{header}</div>

      <section className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-[220px] shrink-0 overflow-y-auto border-r border-white/8 bg-[#080807] lg:block xl:w-[238px]">
          {sidebar}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#050505]">
          <div className="min-h-0 flex-1 overflow-hidden">{canvas}</div>

          {showDock ? (
            <div className="hidden h-[210px] shrink-0 overflow-hidden border-t border-white/8 2xl:block">
              {dock}
            </div>
          ) : null}
        </section>

        {showInspector ? (
          <aside className="hidden w-[286px] shrink-0 overflow-y-auto border-l border-white/8 bg-[#080807] 2xl:block">
            {inspector}
          </aside>
        ) : null}
      </section>

      <div className="shrink-0 border-t border-white/8 bg-[#080807] lg:hidden">
        <div className="max-h-[168px] overflow-y-auto">{sidebar}</div>
      </div>
    </main>
  );
}
