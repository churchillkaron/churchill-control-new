import Link from "next/link";

function creativeHref(organizationId, suffix = "") {
  const id = String(organizationId || "").trim();
  if (!id) return "/creative";
  return `/workspace/${encodeURIComponent(id)}/creative${suffix}`;
}

export default function CreativeRuntimeEntryShell({
  organizationId,
  eyebrow = "Creative Studio",
  title,
  description,
  statusLabel,
  statusDetail,
  runtimeLabel,
  capabilities = [],
  openSuffix = null,
  openLabel = "Open shared studio",
}) {
  const homeHref = creativeHref(organizationId);
  const openHref = openSuffix ? creativeHref(organizationId, openSuffix) : null;

  return (
    <section className="min-h-[70vh] bg-[#050505] px-5 py-8 text-white lg:px-8 lg:py-10">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.025] shadow-2xl shadow-black/30">
        <header className="border-b border-white/8 bg-[radial-gradient(circle_at_top_right,rgba(214,166,106,0.10),transparent_38%)] px-6 py-8 sm:px-8 lg:px-10">
          <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#D6A66A]">
            {eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white/92 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
            {description}
          </p>
        </header>

        <div className="grid gap-5 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
          <div className="rounded-2xl border border-white/8 bg-black/25 p-5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/28">
              Runtime boundary
            </div>
            <div className="mt-3 text-base font-medium text-white/82">
              {runtimeLabel}
            </div>
            <p className="mt-2 text-xs leading-5 text-white/36">
              {statusDetail}
            </p>

            {capabilities.length ? (
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {capabilities.map((capability) => (
                  <div
                    key={capability}
                    className="rounded-xl border border-white/7 bg-white/[0.025] px-3 py-2.5 text-xs text-white/48"
                  >
                    {capability}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="rounded-2xl border border-[#D6A66A]/18 bg-[#D6A66A]/[0.055] p-5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#D6A66A]/75">
              Surface status
            </div>
            <div className="mt-3 text-lg font-medium text-[#F0D39E]">
              {statusLabel}
            </div>
            <p className="mt-2 text-xs leading-5 text-white/38">
              Creative is the customer-facing entry layer. This surface does not replace, duplicate, or bypass the governed execution runtime behind it.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {openHref ? (
                <Link
                  href={openHref}
                  className="rounded-xl border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-4 py-2.5 text-xs font-medium text-[#F0D39E] transition hover:bg-[#D6A66A]/15"
                >
                  {openLabel}
                </Link>
              ) : null}
              <Link
                href={homeHref}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-xs font-medium text-white/55 transition hover:border-white/18 hover:text-white/75"
              >
                Creative home
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
