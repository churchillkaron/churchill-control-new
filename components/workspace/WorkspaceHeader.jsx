"use client";

export default function WorkspaceHeader({
  title,
  description,
  workspace,
  actions,
  children,
}) {
  return (
    <section className="mb-8 rounded-[32px] border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-5xl">
          <div className="text-xs uppercase tracking-[0.32em] text-[#D6A66A]">
            {workspace || "Workspace"}
          </div>

          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em] text-white">
            {title}
          </h1>

          {description && (
            <p className="mt-3 max-w-4xl text-base leading-7 text-white/55">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-3">
            {actions}
          </div>
        )}
      </div>

      {children && (
        <div className="mt-7 border-t border-white/10 pt-6">
          {children}
        </div>
      )}
    </section>
  );
}
