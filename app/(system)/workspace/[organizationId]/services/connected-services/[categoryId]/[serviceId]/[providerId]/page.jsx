"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function ProviderDetailPage({ params }) {
  const { organizationId, categoryId, serviceId, providerId } = params;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setError("");

      const query = new URLSearchParams({
        organization_id: organizationId,
        category_id: categoryId,
        service_id: serviceId,
        provider_id: providerId,
      });

      const res = await fetch(
        `/api/platform/services/providers?${query.toString()}`,
        { cache: "no-store" }
      );

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Could not load provider");
        return;
      }

      setData(json);
    }

    load();
  }, [organizationId, categoryId, serviceId, providerId]);

  const service = data?.service;
  const provider = data?.provider;
  const connection = provider?.connection;

  return (
    <main className="min-h-screen p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          href={`/workspace/${organizationId}/services/connected-services/${categoryId}/${serviceId}`}
          className="text-sm text-white/60 hover:text-white"
        >
          ← {service?.name || "Service"}
        </Link>

        <section className="rounded-3xl border border-white/10 bg-black/40 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-white/50">
            Provider
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            {provider?.name || providerId}
          </h1>
          <p className="mt-2 max-w-3xl text-white/60">
            Provider details only live here. The parent business object remains
            Organization Service.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-5">
            <Metric label="Service" value={service?.name || serviceId} />
            <Metric label="Status" value={provider?.status || "not_connected"} />
            <Metric label="Health" value={provider?.health || "unknown"} />
            <Metric label="Auth" value={provider?.auth_type || "unknown"} />
            <Metric label="Billing" value="Usage based" />
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          <Panel title="Authorization">
            <Row label="Authorization type" value={provider?.auth_type || "unknown"} />
            <Row label="Connection status" value={provider?.status || "not_connected"} />
            <Row label="Provider ID" value={provider?.id || providerId} />
          </Panel>

          <Panel title="Health">
            <Row label="Current health" value={provider?.health || "unknown"} />
            <Row label="Last checked" value={connection?.last_checked_at || "Not checked"} />
            <Row label="Errors" value={connection?.last_error || "No error recorded"} />
          </Panel>

          <Panel title="Usage">
            <Row label="Usage source" value="platform_service_usage" />
            <Row label="Billing owner" value="Finance" />
            <Row label="Wallet source" value="organization_wallets" />
          </Panel>

          <Panel title="Configuration">
            <pre className="overflow-auto rounded-2xl bg-black/40 p-4 text-xs text-white/60">
              {JSON.stringify(connection?.configuration || {}, null, 2)}
            </pre>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-semibold capitalize">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.2em] text-white/45">
        {label}
      </div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3 text-sm">
      <span className="text-white/50">{label}</span>
      <span className="text-right text-white/80">{value}</span>
    </div>
  );
}
