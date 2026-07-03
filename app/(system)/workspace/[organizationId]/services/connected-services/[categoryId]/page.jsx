"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function ServiceCategoryPage({ params }) {
  const { organizationId, categoryId } = params;
  const [category, setCategory] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setError("");

      const res = await fetch(
        `/api/platform/services/organization?organization_id=${organizationId}`,
        { cache: "no-store" }
      );

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Could not load service category");
        return;
      }

      const found = (json.services || []).find((item) => item.id === categoryId);
      setCategory(found || null);
    }

    load();
  }, [organizationId, categoryId]);

  const totals = useMemo(() => {
    const services = category?.services || [];
    return {
      services: services.length,
      enabled: services.filter((service) => service.enabled).length,
      connectedProviders: services
        .flatMap((service) => service.providers || [])
        .filter((provider) => provider.connected).length,
    };
  }, [category]);

  return (
    <main className="min-h-screen p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          href={`/workspace/${organizationId}/services/connected-services`}
          className="text-sm text-white/60 hover:text-white"
        >
          ← Connected Services
        </Link>

        <section className="rounded-3xl border border-white/10 bg-black/40 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-white/50">
            Service Category
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            {category?.name || categoryId}
          </h1>
          <p className="mt-2 text-white/60">
            {category?.description || "Loading category..."}
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <Metric label="Business Services" value={totals.services} />
            <Metric label="Enabled" value={totals.enabled} />
            <Metric label="Connected Providers" value={totals.connectedProviders} />
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          {(category?.services || []).map((service) => (
            <Link
              key={service.id}
              href={`/workspace/${organizationId}/services/connected-services/${categoryId}/${service.id}`}
              className="rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{service.name}</h2>
                  <p className="mt-2 text-sm text-white/55">
                    {service.description}
                  </p>
                </div>
                <StatusPill enabled={service.enabled} />
              </div>

              <div className="mt-4 text-sm text-white/45">
                Providers: {(service.providers || []).length}
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs uppercase tracking-[0.2em] text-white/45">
        {label}
      </div>
    </div>
  );
}

function StatusPill({ enabled }) {
  return (
    <span
      className={[
        "rounded-full px-3 py-1 text-xs",
        enabled ? "bg-emerald-500/15 text-emerald-200" : "bg-white/10 text-white/50",
      ].join(" ")}
    >
      {enabled ? "Enabled" : "Not enabled"}
    </span>
  );
}
