"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Loader2,
  Megaphone,
  Plus,
  Sparkles,
  X,
} from "lucide-react";

const DEFAULT_FORM = {
  name: "",
  objective: "",
  offer: "",
  primaryCta: "",
  coreMessage: "",
  market: "",
  audienceApproach: "",
  creativeDirection: "",
  channels: "Facebook, Instagram",
  startDate: "",
  endDate: "",
  masterBudget: "",
  organizationBudget: "",
};

function splitList(value) {
  return String(value || "")
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function CampaignCommandCenter() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const ownerOrganizationId = String(params?.organizationId || "");
  const [mode, setMode] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrganizations, setSelectedOrganizations] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [prepared, setPrepared] = useState([]);

  const campaignArea = pathname?.includes("/commercial/marketing/campaigns");
  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || groups[0] || null,
    [groups, selectedGroupId],
  );

  useEffect(() => {
    if (!mode || !ownerOrganizationId) return;
    loadContext();
  }, [mode, ownerOrganizationId]);

  async function command(payload) {
    const response = await fetch("/api/marketing/campaign-command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || "Marketing command failed");
    }
    return result.data;
  }

  async function loadContext() {
    setContextLoading(true);
    setMessage("");
    try {
      const data = await command({ action: "context", ownerOrganizationId });
      const rows = data?.organizations || [];
      setOrganizations(rows);
      setSelectedOrganizations((current) =>
        current.length
          ? current.filter((id) => rows.some((row) => row.id === id))
          : rows.some((row) => row.id === ownerOrganizationId)
            ? [ownerOrganizationId]
            : rows[0]?.id
              ? [rows[0].id]
              : [],
      );

      if (mode === "creative") {
        const response = await fetch("/api/marketing/campaign-groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId: ownerOrganizationId }),
        });
        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || payload?.message || "Unable to load campaigns");
        }
        const groupRows = payload?.data?.groups || [];
        setGroups(groupRows);
        setSelectedGroupId((current) =>
          current && groupRows.some((row) => row.id === current)
            ? current
            : groupRows[0]?.id || "",
        );
      }
    } catch (error) {
      setMessage(error.message || "Unable to load marketing context");
    } finally {
      setContextLoading(false);
    }
  }

  function toggleOrganization(id) {
    setSelectedOrganizations((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  async function createCampaign(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await command({
        action: "create_campaign",
        ownerOrganizationId,
        organizationIds: selectedOrganizations,
        ...form,
        channels: splitList(form.channels),
        audienceSegments: [],
        contentPillars: [],
        measurement: [],
        currencyCode: "THB",
      });
      setMessage(
        data?.mode === "multi_organization"
          ? `Created master campaign with ${data.campaigns?.length || 0} organization campaigns.`
          : "Campaign created.",
      );
      setForm(DEFAULT_FORM);
      router.refresh();
      setTimeout(() => {
        setMode(null);
        if (data?.mode === "multi_organization") {
          router.push(`/workspace/${ownerOrganizationId}/commercial/marketing/campaigns/whole`);
        } else {
          router.push(`/workspace/${ownerOrganizationId}/commercial/marketing/campaigns`);
        }
      }, 700);
    } catch (error) {
      setMessage(error.message || "Campaign creation failed");
    } finally {
      setLoading(false);
    }
  }

  async function prepareWholeCampaign({ execute = false } = {}) {
    if (!selectedGroup?.members?.length) return;
    if (
      execute &&
      !window.confirm(
        "Start Creative Studio production for every organization in this campaign? This may use connected creative services and may trigger a separate cost-approval boundary. It will not authorize advertising spend.",
      )
    ) {
      return;
    }

    setLoading(true);
    setMessage("");
    setPrepared([]);

    try {
      const completed = [];
      for (const member of selectedGroup.members) {
        const campaign = member.campaign;
        if (!campaign?.id || !member.organization_id) continue;
        const data = await command({
          action: execute ? "execute_creative" : "prepare_creative",
          organizationId: member.organization_id,
          campaignId: campaign.id,
        });
        completed.push({
          organizationName: member.organization?.name || "Organization",
          campaignName: campaign.campaign_name,
          studioPath: data?.studio_path,
          status: data?.execution?.status || (execute ? "STARTED" : "PREPARED"),
        });
        setPrepared([...completed]);
      }
      setMessage(
        execute
          ? `Creative production started for ${completed.length} organization campaigns.`
          : `Studio missions prepared for ${completed.length} organization campaigns.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(error.message || "Unable to hand campaign to Creative Studio");
    } finally {
      setLoading(false);
    }
  }

  if (!campaignArea) return null;

  return (
    <>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setPrepared([]);
            setMessage("");
            setMode("create");
          }}
          className="inline-flex items-center gap-2 rounded-full border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-4 py-2 text-sm font-medium text-[#E6C18C] transition hover:bg-[#D6A66A]/15"
        >
          <Plus className="h-4 w-4" /> Create Campaign
        </button>
        <button
          type="button"
          onClick={() => {
            setPrepared([]);
            setMessage("");
            setMode("creative");
          }}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.08]"
        >
          <Sparkles className="h-4 w-4 text-[#D6A66A]" /> Avantiqo Create
        </button>
      </div>

      {mode ? (
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/80 p-4 pt-20 backdrop-blur-md lg:p-8 lg:pt-24">
          <div className="w-full max-w-4xl rounded-[30px] border border-white/10 bg-[#090909] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6 lg:p-8">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
                  Marketing Command Center
                </div>
                <h2 className="mt-2 text-3xl font-light text-white">
                  {mode === "create" ? "Create Campaign" : "Tell Avantiqo to Create"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/40">
                  {mode === "create"
                    ? "Create one organization campaign or coordinate several organizations under one master campaign. All spend starts as planned, not authorized."
                    : "Turn the campaign strategy into real Creative Studio missions using each organization’s own goal, audience, channels and brand context."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMode(null)}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-white/50 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {contextLoading ? (
              <div className="flex items-center gap-3 p-8 text-white/45">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading organizations and campaigns...
              </div>
            ) : mode === "create" ? (
              <form onSubmit={createCampaign} className="space-y-6 p-6 lg:p-8">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-white/35">
                    Organizations
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {organizations.map((organization) => {
                      const active = selectedOrganizations.includes(organization.id);
                      return (
                        <button
                          key={organization.id}
                          type="button"
                          onClick={() => toggleOrganization(organization.id)}
                          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${
                            active
                              ? "border-[#D6A66A]/40 bg-[#D6A66A]/10 text-[#E6C18C]"
                              : "border-white/10 bg-white/[0.025] text-white/55 hover:border-white/20"
                          }`}
                        >
                          <span>{organization.name}</span>
                          {active ? <Check className="h-4 w-4" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Campaign Name" required value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
                  <Field label="Objective" required value={form.objective} onChange={(value) => setForm((current) => ({ ...current, objective: value }))} />
                  <Field label="Offer" value={form.offer} onChange={(value) => setForm((current) => ({ ...current, offer: value }))} />
                  <Field label="Primary CTA" value={form.primaryCta} onChange={(value) => setForm((current) => ({ ...current, primaryCta: value }))} />
                  <Field label="Core Message" value={form.coreMessage} onChange={(value) => setForm((current) => ({ ...current, coreMessage: value }))} />
                  <Field label="Market" value={form.market} onChange={(value) => setForm((current) => ({ ...current, market: value }))} />
                  <Field label="Audience Approach" value={form.audienceApproach} onChange={(value) => setForm((current) => ({ ...current, audienceApproach: value }))} />
                  <Field label="Creative Direction" value={form.creativeDirection} onChange={(value) => setForm((current) => ({ ...current, creativeDirection: value }))} />
                  <Field label="Channels" value={form.channels} onChange={(value) => setForm((current) => ({ ...current, channels: value }))} helper="Comma separated" />
                  <Field label="Budget / Organization / Month" type="number" value={form.organizationBudget} onChange={(value) => setForm((current) => ({ ...current, organizationBudget: value }))} />
                  {selectedOrganizations.length > 1 ? (
                    <Field label="Master Budget / Month" type="number" value={form.masterBudget} onChange={(value) => setForm((current) => ({ ...current, masterBudget: value }))} />
                  ) : null}
                  <Field label="Start Date" type="date" value={form.startDate} onChange={(value) => setForm((current) => ({ ...current, startDate: value }))} />
                  <Field label="End Date" type="date" value={form.endDate} onChange={(value) => setForm((current) => ({ ...current, endDate: value }))} />
                </div>

                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 text-sm text-amber-100/70">
                  Creating a campaign does not authorize advertising spend. Every new campaign starts Draft / Planned Not Authorized.
                </div>

                {message ? <Message value={message} /> : null}

                <div className="flex justify-end gap-3 border-t border-white/10 pt-5">
                  <button type="button" onClick={() => setMode(null)} className="rounded-xl border border-white/10 px-5 py-3 text-sm text-white/55">Cancel</button>
                  <button
                    type="submit"
                    disabled={loading || !form.name.trim() || !form.objective.trim() || !selectedOrganizations.length}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-40"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                    Create Campaign
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-6 p-6 lg:p-8">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-white/35">Campaign</div>
                  <div className="relative mt-3">
                    <select
                      value={selectedGroup?.id || ""}
                      onChange={(event) => setSelectedGroupId(event.target.value)}
                      className="w-full appearance-none rounded-2xl border border-white/10 bg-black/40 px-4 py-4 pr-10 text-sm text-white outline-none focus:border-[#D6A66A]/40"
                    >
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>{group.campaign_group_name}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  </div>
                </div>

                {selectedGroup ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                    <div className="text-lg text-white/80">{selectedGroup.campaign_group_name}</div>
                    <div className="mt-1 text-sm text-white/40">{selectedGroup.objective}</div>
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      {(selectedGroup.members || []).map((member) => (
                        <div key={member.id} className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.12em] text-[#D6A66A]">{member.organization?.name}</div>
                          <div className="mt-1 text-sm text-white/60">{member.campaign?.campaign_name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 text-sm text-white/35">No whole campaign available yet. Create one first.</div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    disabled={loading || !selectedGroup}
                    onClick={() => prepareWholeCampaign({ execute: false })}
                    className="rounded-2xl border border-[#D6A66A]/30 bg-[#D6A66A]/10 p-5 text-left transition hover:bg-[#D6A66A]/15 disabled:opacity-40"
                  >
                    <Sparkles className="h-5 w-5 text-[#D6A66A]" />
                    <div className="mt-3 text-base font-medium text-[#F0D5AE]">Prepare in Creative Studio</div>
                    <div className="mt-1 text-sm leading-relaxed text-white/40">Creates and starts real campaign-linked Creative Missions, projects and briefs for every organization.</div>
                  </button>
                  <button
                    type="button"
                    disabled={loading || !selectedGroup}
                    onClick={() => prepareWholeCampaign({ execute: true })}
                    className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-5 text-left transition hover:bg-emerald-500/[0.11] disabled:opacity-40"
                  >
                    <Megaphone className="h-5 w-5 text-emerald-300" />
                    <div className="mt-3 text-base font-medium text-emerald-200">Start Creative Production</div>
                    <div className="mt-1 text-sm leading-relaxed text-white/40">Tells the Creative Director to execute. Provider/cost approval remains governed separately; advertising spend stays unauthorized.</div>
                  </button>
                </div>

                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Working through organization campaigns...</div>
                ) : null}

                {prepared.length ? (
                  <div className="space-y-2">
                    {prepared.map((item) => (
                      <div key={`${item.organizationName}-${item.campaignName}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.12em] text-[#D6A66A]">{item.organizationName}</div>
                          <div className="mt-1 text-sm text-white/60">{item.campaignName}</div>
                        </div>
                        <div className="text-xs uppercase tracking-[0.12em] text-emerald-300">{item.status}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {message ? <Message value={message} /> : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, value, onChange, type = "text", required = false, helper = "" }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.14em] text-white/35">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        min={type === "number" ? "0" : undefined}
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#D6A66A]/40"
      />
      {helper ? <span className="mt-1 block text-[11px] text-white/25">{helper}</span> : null}
    </label>
  );
}

function Message({ value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/60">
      {value}
    </div>
  );
}
