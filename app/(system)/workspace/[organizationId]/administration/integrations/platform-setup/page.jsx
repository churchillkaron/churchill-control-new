"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Copy, RefreshCw, ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";

function badge(ready) {
  return ready
    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
    : "border-amber-400/20 bg-amber-400/10 text-amber-100";
}

export default function PlatformProviderSetupPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "").trim();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/administration/integrations/platform-setup?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error || "Unable to load provider setup");
      }
      setState(body);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load provider setup");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId]);

  const rows = useMemo(() => {
    const source = Array.isArray(state?.rows) ? state.rows : [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return source;
    return source.filter((row) =>
      [row.name, row.category, row.authModel, row.setup?.summary, ...(row.missing || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [state, query]);

  async function copy(value) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black p-6 text-white lg:p-10">
        <div className="mx-auto max-w-7xl text-sm text-white/45">Loading Avantiqo provider setup…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-7xl">
        <Link
          href={`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`}
          className="text-sm text-[#D6A66A]"
        >
          ← Integrations
        </Link>

        <div className="mt-7 flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-8">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-[#D6A66A]">
              <ShieldCheck className="h-4 w-4" />
              Avantiqo Platform
            </div>
            <h1 className="mt-3 text-4xl font-semibold lg:text-5xl">Provider Setup Center</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/50">
              Configure each external provider once for the Avantiqo platform. Customers only see a Connect action after the platform side is ready.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-white/70"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh readiness
          </button>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {state ? (
          <>
            <section className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                ["Providers", state.summary?.providers ?? 0],
                ["Ready for customers", state.summary?.ready ?? 0],
                ["Avantiqo setup required", state.summary?.blocked ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/35">{label}</div>
                  <div className="mt-2 text-3xl font-semibold">{value}</div>
                </div>
              ))}
            </section>

            <div className="mt-6">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search providers, auth model or missing setup…"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-white/25"
              />
            </div>

            <section className="mt-5 space-y-4">
              {rows.map((provider) => (
                <article key={provider.id} className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/30">{provider.category}</div>
                      <h2 className="mt-2 text-2xl font-medium">{provider.name}</h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">{provider.setup?.summary}</p>
                    </div>
                    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${badge(provider.ready)}`}>
                      {provider.ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
                      {provider.ready ? "Customer connection ready" : "Avantiqo setup required"}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
                      <div className="text-xs uppercase tracking-[0.16em] text-white/35">Avantiqo setup</div>
                      <div className="mt-3 space-y-2">
                        {(provider.setup?.steps || []).map((step, index) => (
                          <div key={`${provider.id}-step-${index}`} className="flex gap-3 text-sm leading-5 text-white/65">
                            <span className="mt-0.5 text-[#D6A66A]">{index + 1}.</span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>

                      {provider.missing?.length ? (
                        <div className="mt-5 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-4">
                          <div className="text-xs font-semibold text-amber-100">Missing platform configuration</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {provider.missing.map((item) => (
                              <code key={item} className="rounded-lg bg-black/30 px-2 py-1 text-[11px] text-amber-50/80">{item}</code>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {provider.optionalMissing?.length ? (
                        <div className="mt-4 text-xs leading-5 text-white/35">
                          Optional configuration not set: {provider.optionalMissing.join(", ")}
                        </div>
                      ) : null}

                      {provider.setup?.approval ? (
                        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-5 text-white/45">
                          {provider.setup.approval}
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
                        <div className="text-xs uppercase tracking-[0.16em] text-white/35">Customer experience after setup</div>
                        <div className="mt-3 text-sm text-white/75">{provider.customer?.label || "Connect provider"}</div>
                        <div className="mt-2 text-xs text-white/35">
                          {provider.customer?.technicalInputRequired
                            ? "Technical customer input required"
                            : "No API keys, client secrets or developer-console setup required from the customer"}
                        </div>
                      </div>

                      {provider.setup?.callbackUrls?.length ? (
                        <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
                          <div className="text-xs uppercase tracking-[0.16em] text-white/35">Callback / webhook URLs</div>
                          <div className="mt-3 space-y-2">
                            {provider.setup.callbackUrls.map((url) => (
                              <div key={url} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black px-3 py-2">
                                <code className="min-w-0 flex-1 truncate text-[11px] text-white/55">{url}</code>
                                <button type="button" onClick={() => copy(url)} className="shrink-0 text-white/35 hover:text-white/70" aria-label="Copy URL">
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
