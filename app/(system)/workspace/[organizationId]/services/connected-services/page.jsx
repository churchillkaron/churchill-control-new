"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function ConnectedServicesPage({ params }) {
  const organizationId = params.organizationId;
  const [services, setServices] = useState([]);
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
        setError(json.error || "Could not load services");
        return;
      }

      setServices(json.services || []);
    }

    load();
  }, [organizationId]);

  const totals = useMemo(() => {
    const allServices = services.flatMap((category) => category.services || []);
    return {
      categories: services.length,
      services: allServices.length,
      enabled: allServices.filter((service) => service.enabled).length,
      providers: allServices.flatMap((service) => service.providers || []).length,
      connected: allServices
        .flatMap((service) => service.providers || [])
        .filter((provider) => provider.connected).length,
    };
  }, [services]);

  return (
    <main className="min-h-screen p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-white/10 bg-black/40 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-white/50">
            Organization Services
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            Connected Services
          </h1>
          <p className="mt-2 max-w-3xl text-white/60">
            Business services first. Providers only appear inside each service.
            Status comes from organization_services and organization_service_providers.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-5">
            <Metric label="Categories" value={totals.categories} />
            <Metric label="Services" value={totals.services} />
            <Metric label="Enabled" value={totals.enabled} />
            <Metric label="Providers" value={totals.providers} />
            <Metric label="Connected" value={totals.connected} />
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          {services.map((category) => {
            const enabled = (category.services || []).filter(
              (service) => service.enabled
            ).length;

            return (
              <Link
                key={category.id}
                href={`/workspace/${organizationId}/services/connected-services/${category.id}`}
                className="rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {category.name}
                    </h2>
                    <p className="mt-2 text-sm text-white/55">
                      {category.description}
                    </p>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">
                    {enabled}/{category.services?.length || 0}
                  </span>
                </div>
              </Link>
            );
          })}
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
