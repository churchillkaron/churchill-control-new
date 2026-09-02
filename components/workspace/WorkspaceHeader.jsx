"use client";

export default function WorkspaceHeader({
  title,
  description,
  workspace,
  actions,
  children,
}) {
  return (
    <section className="mb-6 rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-5xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#A37849]">
            {workspace || "Workspace"}
          </div>

          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-[#1B1A18] md:text-[34px]">
            {title}
          </h1>

          {description && (
            <p className="mt-2.5 max-w-4xl text-[13px] leading-6 text-[#6F6B64]">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2.5">
            {actions}
          </div>
        )}
      </div>

      {children && (
        <div className="mt-6 border-t border-black/[0.07] pt-5">
          {children}
        </div>
      )}
    </section>
  );
}