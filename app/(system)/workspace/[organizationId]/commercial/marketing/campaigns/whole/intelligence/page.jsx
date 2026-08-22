"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

function money(value, currency = "THB") {
  return new Intl.NumberFormat("en-TH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function label(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function multiple(value) {
  return value == null ? "Not measured" : `${Number(value).toFixed(2)}x`;
}

export default function AdsIntelligencePage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      try {
        const response = await fetch("/api/marketing/campaign-groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId }),
        });
        const payload = await response.json();
        if (!response.ok || payload?.success === false) {
          throw new Error(payload?.error || "Unable to load campaigns");
        }
        const rows = payload?.data?.groups || [];
        setGroups(rows);
        setGroupId(rows[0]?.id || "");
      } catch (e) {
        setError(e.message || "Unable to load campaigns");
      } finally {
        setLoading(false);
      }
    })();
  }, [organizationId]);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const response = await fetch("/api/marketing/campaign-intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, groupId }),
        });
        const payload = await response.json();
        if (!response.ok || payload?.success === false) {
          throw new Error(payload?.error || "Unable to analyze portfolio");
        }
        setData(payload.data);
      } catch (e) {
        setError(e.message || "Unable to analyze portfolio");
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId, organizationId]);

  const selected = groups.find((group) => group.id === groupId) || groups[0] || null;
  const currency = selected?.currency_code || "THB";
  const allocation = data?.capital_allocation_proposal || null;

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-[1500px]">
        <Link
          href={`/workspace/${organizationId}/commercial/marketing/campaigns/whole`}
          className="text-sm text-white/40 hover:text-white/70"
        >
          ← Whole Campaign
        </Link>

        <div className="mt-6 text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
          Avantiqo Ads Intelligence
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-5xl font-light">Portfolio Decision Engine</h1>
            <p className="mt-3 max-w-3xl text-white/45">
              Profit-first business-outcome intelligence. Revenue is evidence, but scale decisions require repeated conversions and attributed gross profit above measured media spend.
            </p>
          </div>

          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm"
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.campaign_group_name}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? <div className="mt-8 text-white/40">Building decision model...</div> : null}

        {!loading && data ? (
          <div className="mt-8 space-y-6">
            <section className="rounded-[30px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.035] p-6">
              <h2 className="text-3xl font-light">Business Outcome Brain</h2>
              <p className="mt-2 max-w-4xl text-sm text-white/45">{data.objective}</p>

              <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Metric label="Measured Spend" value={money(data.portfolio?.measured_spend, currency)} />
                <Metric label="Attributed Revenue" value={money(data.portfolio?.attributed_revenue, currency)} />
                <Metric label="Gross Profit" value={money(data.portfolio?.attributed_gross_profit, currency)} />
                <Metric label="Profit After Media" value={money(data.portfolio?.profit_after_media, currency)} />
                <Metric label="Profit / Ad Spend" value={multiple(data.portfolio?.profit_on_ad_spend)} />
                <Metric label="Qualified Outcomes" value={String(data.portfolio?.qualified_outcomes || 0)} />
              </div>
            </section>

            <section className="rounded-[30px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.025] p-6">
              <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">Next Baht Allocation</div>
              <h2 className="mt-2 text-3xl font-light">Controlled Scale Proposal</h2>
              <p className="mt-2 max-w-4xl text-sm text-white/45">
                {allocation?.allocation_principle}
              </p>

              <div className="mt-5 space-y-3">
                {(allocation?.next_baht_priority || []).length ? (
                  allocation.next_baht_priority.map((item) => (
                    <div key={item.campaign_id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="text-xs uppercase tracking-[0.13em] text-[#D6A66A]">
                            Priority #{item.rank} · {item.organization_name}
                          </div>
                          <div className="mt-1 text-lg text-white/80">{item.campaign_name}</div>
                          <p className="mt-2 max-w-4xl text-sm text-white/45">{item.rationale}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-right text-xs text-white/40">
                          <span>Profit / Ad Spend</span><span>{multiple(item.observed_profit_on_ad_spend)}</span>
                          <span>Profit After Media</span><span>{money(item.observed_profit_after_media, currency)}</span>
                          <span>Qualified Outcomes</span><span>{item.qualified_outcomes}</span>
                          <span>Evidence</span><span>{item.evidence_score}/{item.evidence_max}</span>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-amber-100/60">
                        No budget amount is recommended until controlled increment history establishes a marginal-return curve. Explicit authorization remains required.
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/45">
                    No safe scale candidate yet. Continue measurement and controlled learning before allocating additional media budget.
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-white/35">
                Marginal model: {allocation?.marginal_model?.available ? "available" : "not yet available"}. {allocation?.marginal_model?.reason}
              </div>
            </section>

            <section className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
              <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
                Executive Actions
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {(data.executive_actions || []).map((action, index) => (
                  <div
                    key={`${action.action}-${index}`}
                    className="rounded-2xl border border-white/10 bg-black/30 p-4"
                  >
                    <div className="text-xs text-[#D6A66A]">
                      {label(action.priority)} · {label(action.action)}
                    </div>
                    <p className="mt-2 text-sm text-white/55">{action.reason}</p>
                    <div className="mt-2 text-xs text-white/30">
                      {(action.organizations || []).join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              {(data.campaigns || []).map((campaign) => (
                <article
                  key={campaign.campaign_id}
                  className="rounded-[26px] border border-white/10 bg-white/[0.025] p-5"
                >
                  <div className="flex flex-wrap justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.15em] text-[#D6A66A]">
                        {campaign.organization_name}
                      </div>
                      <h3 className="mt-2 text-2xl">{campaign.campaign_name}</h3>
                      <div className="mt-1 text-sm text-white/35">
                        North star: {campaign.north_star_metric}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-white/60">{label(campaign.decision)}</div>
                      <div className="text-xs text-white/30">
                        Evidence {campaign.evidence_score}/{campaign.evidence_max}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Metric label="Spend" value={money(campaign.metrics?.spend, currency)} />
                    <Metric label="Revenue" value={money(campaign.metrics?.revenue, currency)} />
                    <Metric label="Gross Profit" value={money(campaign.metrics?.gross_profit, currency)} />
                    <Metric label="Profit After Media" value={money(campaign.metrics?.profit_after_media, currency)} />
                    <Metric label="Profit / Ad Spend" value={multiple(campaign.metrics?.profit_on_ad_spend)} />
                    <Metric label="Qualified Outcomes" value={String(campaign.metrics?.conversions || 0)} />
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <ListBox title="Evidence Gaps" items={campaign.blockers} />
                    <ListBox title="Next Opportunities" items={campaign.opportunities} />
                  </div>
                </article>
              ))}
            </section>

            <section className="rounded-[30px] border border-amber-500/20 bg-amber-500/[0.04] p-5 text-sm text-amber-100/70">
              Governance lock: Avantiqo may analyze, rank candidates and prepare controlled scale proposals. Moving budget, recommending an unvalidated budget amount, increasing spend or activating paid providers still requires sufficient marginal evidence and explicit authorization.
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Metric({ label: metricLabel, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] uppercase tracking-[0.13em] text-white/25">
        {metricLabel}
      </div>
      <div className="mt-1 text-lg text-white/75">{value}</div>
    </div>
  );
}

function ListBox({ title, items = [] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-xs uppercase tracking-[0.13em] text-[#D6A66A]">{title}</div>
      <div className="mt-3 space-y-2 text-sm text-white/45">
        {items.length ? (
          items.map((item) => <div key={item}>• {item}</div>)
        ) : (
          <div>No material issue detected.</div>
        )}
      </div>
    </div>
  );
}
