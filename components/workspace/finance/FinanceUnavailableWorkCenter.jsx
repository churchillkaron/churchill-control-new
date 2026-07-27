"use client";

function statusLabel(value) {
  const status = String(value || "planned")
    .trim()
    .toLowerCase();

  if (status === "blocked") return "Blocked";
  if (status === "partial") return "Partial";
  if (status === "unproven") return "Unproven";
  if (status === "disabled" || status === "unavailable") return "Unavailable";
  return "Planned";
}

export default function FinanceUnavailableWorkCenter({ capability }) {
  const label = statusLabel(capability?.status);

  return (
    <main className="min-h-[70vh] bg-black px-6 py-10 text-white md:px-10">
      <section className="mx-auto max-w-4xl rounded-[34px] border border-white/10 bg-white/[0.025] p-8 shadow-2xl shadow-black/70 md:p-12">
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#D6A66A]">
          Finance capability
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-light tracking-[-0.055em] md:text-5xl">
            {capability?.name || "Finance workspace"}
          </h1>
          <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-amber-200/75">
            {label}
          </span>
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/48">
          {capability?.description || "This Finance capability is not available for production use yet."}
        </p>

        <div className="mt-8 rounded-3xl border border-white/[0.08] bg-black/35 p-6">
          <div className="text-sm font-medium text-white/75">
            This page is intentionally unavailable.
          </div>
          <p className="mt-2 text-sm leading-6 text-white/40">
            Avantiqo will not present an empty generic page as a completed Finance capability. The workspace becomes active only after its renderer, data contract, actions and end-to-end tests are proven.
          </p>
        </div>
      </section>
    </main>
  );
}
