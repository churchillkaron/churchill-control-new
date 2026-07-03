"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function ServiceDetailPage({ params }) {
  const { organizationId, categoryId, serviceId } = params;
  const [category, setCategory] = useState(null);
  const [service, setService] = useState(null);
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
        setError(json.error || "Could not load service");
        return;
      }

      const foundCategory = (json.services || []).find(
        (item) => item.id === categoryId
      );

      const foundService = (foundCategory?.services || []).find(
        (item) => item.id === serviceId
      );

      setCategory(foundCategory || null);
      setService(foundService || null);
    }

    load();
  }, [organizationId, categoryId, serviceId]);

  return (
    <main className="min-h-screen p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          href={`/workspace/${organizationId}/services/connected-services/${categoryId}`}
          className="text-sm text-white/60 hover:text-white"
        >
          ← {category?.name || "Category"}
        </Link>

        <section className="rounded-3xl border border-white/10 bg-black/40 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-white/50">
            Business Service
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            {service?.name || serviceId}
          </h1>
          <p className="mt-2 max-w-3xl text-white/60">
            {service?.description || "Loading service..."}
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <Metric label="Status" value={service?.status || "unknown"} />
            <Metric label="Health" value={service?.health || "unknown"} />
            <Metric label="Package" value={service?.package || "core"} />
            <Metric label="Providers" value={(service?.providers || []).length} />
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          {(service?.providers || []).map((provider) => (
            <Link
              key={provider.id}
              href={`/workspace/${organizationId}/services/connected-services/${categoryId}/${serviceId}/${provider.id}`}
              className="rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">
                    {provider.name}
                  </h2>
                  <p className="mt-2 text-sm text-white/55">
                    Authorization: {provider.auth_type}
                  </p>
                </div>
                <ProviderStatus status={provider.status} />
              </div>

              <div className="mt-4 text-sm text-white/45">
                Health: {provider.health || "unknown"}
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
      <div className="text-lg font-semibold capitalize">{value}</div>
      <div className="text-xs uppercase tracking-[0.2em] text-white/45">
        {label}
      </div>
    </div>
  );
}

function ProviderStatus({ status }) {
  const connected = status === "connected";

  return (
    <span
      className={[
        "rounded-full px-3 py-1 text-xs capitalize",
        connected ? "bg-emerald-500/15 text-emerald-200" : "bg-white/10 text-white/50",
      ].join(" ")}
    >
      {status || "not_connected"}
    </span>
  );
}
