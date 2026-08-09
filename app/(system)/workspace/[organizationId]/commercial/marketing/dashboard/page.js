"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

function money(value, currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export default function Dashboard() {
  const params = useParams();
  const organizationId = params?.organizationId;
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!organizationId) return;

    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/commercial/marketing/dashboard?organizationId=${encodeURIComponent(organizationId)}`,
          { credentials: "include" }
        );
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || "Unable to load marketing dashboard");
        }

        if (active) setCampaigns(result.campaigns || []);
      } catch (loadError) {
        if (active) setError(loadError.message || "Unable to load marketing dashboard");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [organizationId]);

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
            Commercial / Marketing
          </div>
          <h1 className="mt-3 text-4xl font-light">Campaign Dashboard</h1>
          <p className="mt-2 text-white/45">
            Organization-owned managed campaigns, reservations and provider delivery status.
          </p>
        </div>

        {loading ? <div className="text-white/45">Loading campaigns…</div> : null}
        {error ? (
          <div className="rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-red-200">
            {error}
          </div>
        ) : null}

        {!loading && !error && campaigns.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-white/45">
            No managed campaigns have been created for this organization.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {campaigns.map((campaign) => (
            <article
              key={campaign.id}
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                    {campaign.provider}
                  </div>
                  <h2 className="mt-2 text-xl font-medium">{campaign.campaign_name}</h2>
                </div>
                <span className="rounded-full border border-[#D6A66A]/30 px-3 py-1 text-xs text-[#E6C18C]">
                  {campaign.status}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-white/35">Authorized</div>
                  <div className="mt-1">{money(campaign.authorized_budget, campaign.currency)}</div>
                </div>
                <div>
                  <div className="text-white/35">Settled</div>
                  <div className="mt-1">{money(campaign.settled_amount, campaign.currency)}</div>
                </div>
                <div>
                  <div className="text-white/35">Released</div>
                  <div className="mt-1">{money(campaign.released_amount, campaign.currency)}</div>
                </div>
              </div>

              <div className="mt-5 text-xs text-white/30">
                {new Date(campaign.created_at).toLocaleString()}
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
