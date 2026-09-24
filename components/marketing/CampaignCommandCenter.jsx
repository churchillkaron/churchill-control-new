"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Image from "next/image";
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
  audienceSegments: "",
  contentPillars: "",
  measurement: "",
  channels: ["facebook", "instagram"],
  startDate: "",
  endDate: "",
  masterBudget: "",
  organizationBudget: "",
  channelSettings: {},
};


const CAMPAIGN_CHANNELS = [
  { id: "facebook", name: "Facebook", group: "Social", logo: "/brand-icons/facebook.svg", provider: "meta", settings: "social" },
  { id: "instagram", name: "Instagram", group: "Social", logo: "/brand-icons/instagram.svg", provider: "meta", settings: "social" },
  { id: "messenger", name: "Messenger", group: "Messaging", logo: "/brand-icons/messenger.svg", provider: "meta", settings: "messaging" },
  { id: "threads", name: "Threads", group: "Social", logo: "/brand-icons/threads.svg", provider: "threads", settings: "social" },
  { id: "tiktok", name: "TikTok", group: "Social", logo: "/brand-icons/tiktok.svg", provider: "tiktok", settings: "social" },
  { id: "youtube", name: "YouTube", group: "Social", logo: "/brand-icons/youtube.svg", provider: "google", settings: "video" },
  { id: "linkedin", name: "LinkedIn", group: "Social", logo: "/brand-icons/linkedin.svg", provider: "linkedin", settings: "social" },
  { id: "x", name: "X", group: "Social", logo: "/brand-icons/x.svg", provider: "x", settings: "social" },
  { id: "pinterest", name: "Pinterest", group: "Social", logo: "/brand-icons/pinterest.svg", provider: "pinterest", settings: "social" },
  { id: "whatsapp", name: "WhatsApp Business", group: "Messaging", logo: "/brand-icons/whatsapp.svg", provider: "whatsapp", settings: "messaging" },
  { id: "line", name: "LINE", group: "Messaging", logo: "/brand-icons/line.svg", provider: "line", settings: "messaging" },
  { id: "telegram", name: "Telegram", group: "Messaging", logo: "/brand-icons/telegram.svg", provider: "telegram", settings: "messaging" },
  { id: "email", name: "Email", group: "Owned", logo: "/brand-icons/gmail.svg", provider: "email", settings: "email" },
  { id: "sms", name: "SMS", group: "Owned", logo: null, provider: "sms", settings: "messaging" },
  { id: "push", name: "Push Notifications", group: "Owned", logo: null, provider: "push", settings: "push" },
  { id: "google_business", name: "Google Business", group: "Discovery", logo: "/brand-icons/google.svg", provider: "google", settings: "local" },
  { id: "tripadvisor", name: "Tripadvisor", group: "Discovery", logo: "/brand-icons/tripadvisor.svg", provider: "tripadvisor", settings: "local" },
  { id: "meta_ads", name: "Meta Ads", group: "Paid", logo: "/brand-icons/meta.svg", provider: "meta", settings: "meta_ads" },
  { id: "google_ads", name: "Google Ads", group: "Paid", logo: "/brand-icons/googleads.svg", provider: "google_ads", settings: "google_ads" },
  { id: "tiktok_ads", name: "TikTok Ads", group: "Paid", logo: "/brand-icons/tiktok.svg", provider: "tiktok", settings: "paid" },
  { id: "linkedin_ads", name: "LinkedIn Ads", group: "Paid", logo: "/brand-icons/linkedin.svg", provider: "linkedin", settings: "paid" },
  { id: "x_ads", name: "X Ads", group: "Paid", logo: "/brand-icons/x.svg", provider: "x", settings: "paid" },
  { id: "line_ads", name: "LINE Ads", group: "Paid", logo: "/brand-icons/line.svg", provider: "line", settings: "paid" },
  { id: "microsoft_ads", name: "Microsoft Ads", group: "Paid", logo: "/brand-icons/microsoft.svg", provider: "microsoft", settings: "paid" },
  { id: "pinterest_ads", name: "Pinterest Ads", group: "Paid", logo: "/brand-icons/pinterest.svg", provider: "pinterest", settings: "paid" },
  { id: "snapchat_ads", name: "Snapchat Ads", group: "Paid", logo: "/brand-icons/snapchat.svg", provider: "snapchat", settings: "paid" },
  { id: "reddit_ads", name: "Reddit Ads", group: "Paid", logo: "/brand-icons/reddit.svg", provider: "reddit", settings: "paid" },
  { id: "amazon_ads", name: "Amazon Ads", group: "Paid", logo: "/brand-icons/amazon.svg", provider: "amazon", settings: "paid" },
  { id: "apple_search_ads", name: "Apple Search Ads", group: "Paid", logo: "/brand-icons/apple.svg", provider: "apple", settings: "paid" },
  { id: "programmatic", name: "Programmatic / CTV / DOOH", group: "Paid", logo: null, provider: "programmatic", settings: "paid" },
  { id: "marketplaces", name: "Commerce & Marketplaces", group: "Commerce", logo: null, provider: "multi", settings: "commerce" },
  { id: "partnerships_offline", name: "Partnerships & Offline", group: "Offline", logo: null, provider: "manual", settings: "offline" },
];

const PICKER_CANONICAL_CHANNEL = Object.freeze({
  facebook: ["organic_social", "facebook"],
  instagram: ["organic_social", "instagram"],
  messenger: ["meta", "messenger"],
  threads: ["organic_social", "threads"],
  tiktok: ["organic_social", "tiktok"],
  youtube: ["organic_social", "youtube"],
  linkedin: ["organic_social", "linkedin"],
  x: ["organic_social", "x"],
  pinterest: ["organic_social", "pinterest"],
  whatsapp: ["whatsapp", "whatsapp"],
  line: ["line", "line"],
  telegram: ["telegram", "telegram"],
  email: ["email", "email"],
  sms: ["sms", "sms"],
  push: ["push", "web_push"],
  google_business: ["local_discovery", "google_business"],
  tripadvisor: ["local_discovery", "tripadvisor"],
  meta_ads: ["meta", null],
  google_ads: ["google_ads", "search"],
  tiktok_ads: ["tiktok_ads", "tiktok"],
  linkedin_ads: ["linkedin_ads", "linkedin"],
  x_ads: ["x_ads", "x"],
  line_ads: ["line_ads", "line"],
  microsoft_ads: ["microsoft_ads", "bing"],
  pinterest_ads: ["pinterest_ads", "pinterest"],
  snapchat_ads: ["snapchat_ads", "snapchat"],
  reddit_ads: ["reddit_ads", "reddit"],
  amazon_ads: ["amazon_ads", "sponsored_products"],
  apple_search_ads: ["apple_search_ads", "app_store"],
  programmatic: ["programmatic", "display"],
  marketplaces: ["commerce_marketplaces", null],
  partnerships_offline: ["partnerships_offline", null],
});

function pickerChannelTarget(channelId) {
  const [catalogId, network] = PICKER_CANONICAL_CHANNEL[channelId] || [channelId, null];
  return { catalogId, network };
}

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
  const [readiness, setReadiness] = useState(null);

  const campaignArea = pathname?.includes("/commercial/marketing/campaigns");
  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || groups[0] || null,
    [groups, selectedGroupId],
  );

  const command = useCallback(async (payload) => {
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
  }, []);

  const loadContext = useCallback(async () => {
    setContextLoading(true);
    setMessage("");
    try {
      const data = await command({ action: "context", ownerOrganizationId });
      const rows = data?.organizations || [];
      setReadiness(data?.readiness || null);
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
  }, [command, mode, ownerOrganizationId]);

  useEffect(() => {
    if (!mode || !ownerOrganizationId) return;
    loadContext();
  }, [loadContext, mode, ownerOrganizationId]);

  function toggleOrganization(id) {
    setSelectedOrganizations((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleChannel(channelId) {
    setForm((current) => ({
      ...current,
      channels: current.channels.includes(channelId)
        ? current.channels.filter((id) => id !== channelId)
        : [...current.channels, channelId],
    }));
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
        channels: form.channels,
        audienceSegments: splitList(form.audienceSegments),
        contentPillars: splitList(form.contentPillars),
        measurement: splitList(form.measurement),
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
          className="inline-flex items-center gap-2 rounded-full border border-[#D2B187] bg-[#FBF4EA] px-4 py-2 text-sm font-semibold text-[#684A2E] transition hover:bg-[#F4E7D5]"
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
          className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 py-2 text-sm font-medium text-[#625B53] transition hover:border-[#C9AD89]"
        >
          <Sparkles className="h-4 w-4 text-[#D6A66A]" /> Avantiqo Create
        </button>
      </div>

      {mode ? (
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-[#241b12]/20 p-4 pt-20 backdrop-blur-md lg:p-8 lg:pt-24">
          <div className="w-full max-w-4xl rounded-[30px] border border-[#DCC8AE] bg-[#FCFAF6] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#E8DED1] p-6 lg:p-8">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[#D6A66A]">
                  Marketing Command Center
                </div>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#2D2822]">
                  {mode === "create" ? "Create Campaign" : "Tell Avantiqo to Create"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#777169]">
                  {mode === "create"
                    ? "Create one organization campaign or coordinate several organizations under one master campaign. All spend starts as planned, not authorized."
                    : "Turn the campaign strategy into real Creative Studio missions using each organization’s own goal, audience, channels and brand context."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMode(null)}
                className="rounded-xl border border-black/[0.08] bg-white p-2 text-[#7C7369] hover:text-[#2D2822]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {contextLoading ? (
              <div className="flex items-center gap-3 p-8 text-[#817B73]">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading organizations and campaigns...
              </div>
            ) : mode === "create" ? (
              <form onSubmit={createCampaign} className="space-y-6 p-6 lg:p-8">
                {organizations.length > 1 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-[#8A8178]">Organizations</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {organizations.map((organization) => {
                        const active = selectedOrganizations.includes(organization.id);
                        return (
                          <button key={organization.id} type="button" onClick={() => toggleOrganization(organization.id)} className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${active ? "border-[#C99A62] bg-[#F8EFE4] text-[#6B4C2E]" : "border-black/[0.08] bg-white text-[#625B53] hover:border-[#C9AD89]"}`}>
                            <span>{organization.name}</span>{active ? <Check className="h-4 w-4" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Campaign Name" required value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
                  <Field label="Objective" required value={form.objective} onChange={(value) => setForm((current) => ({ ...current, objective: value }))} />
                  <Field label="Offer" value={form.offer} onChange={(value) => setForm((current) => ({ ...current, offer: value }))} />
                  <Field label="Primary CTA" value={form.primaryCta} onChange={(value) => setForm((current) => ({ ...current, primaryCta: value }))} />
                  <Field label="Core Message" value={form.coreMessage} onChange={(value) => setForm((current) => ({ ...current, coreMessage: value }))} />
                  <Field label="Market" value={form.market} onChange={(value) => setForm((current) => ({ ...current, market: value }))} />
                  <Field label="Audience Approach" value={form.audienceApproach} onChange={(value) => setForm((current) => ({ ...current, audienceApproach: value }))} />
                  <Field label="Creative Direction" value={form.creativeDirection} onChange={(value) => setForm((current) => ({ ...current, creativeDirection: value }))} />
                  <Field label="Audience Segments" value={form.audienceSegments} onChange={(value) => setForm((current) => ({ ...current, audienceSegments: value }))} helper="Separate with commas" />
                  <Field label="Content Pillars" value={form.contentPillars} onChange={(value) => setForm((current) => ({ ...current, contentPillars: value }))} helper="Separate with commas" />
                  <Field label="Success Metrics" value={form.measurement} onChange={(value) => setForm((current) => ({ ...current, measurement: value }))} helper="Examples: bookings, leads, ROAS, revenue" />
                  <div className="md:col-span-2">
                    <ChannelPicker
                      selected={form.channels}
                      readiness={readiness}
                      organizationId={ownerOrganizationId}
                      onToggle={toggleChannel}
                      settings={form.channelSettings}
                      onSettingChange={(channelId, key, value) => setForm((current) => ({
                        ...current,
                        channelSettings: {
                          ...current.channelSettings,
                          [channelId]: { ...(current.channelSettings[channelId] || {}), [key]: value },
                        },
                      }))}
                    />
                  </div>
                  <Field label="Budget / Organization / Month" type="number" value={form.organizationBudget} onChange={(value) => setForm((current) => ({ ...current, organizationBudget: value }))} />
                  {selectedOrganizations.length > 1 ? (
                    <Field label="Master Budget / Month" type="number" value={form.masterBudget} onChange={(value) => setForm((current) => ({ ...current, masterBudget: value }))} />
                  ) : null}
                  <Field label="Start Date" type="date" value={form.startDate} onChange={(value) => setForm((current) => ({ ...current, startDate: value }))} />
                  <Field label="End Date" type="date" value={form.endDate} onChange={(value) => setForm((current) => ({ ...current, endDate: value }))} />
                </div>

                <div className="rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] px-4 py-3 text-sm text-[#7A5A36]">
                  Creating a campaign does not authorize advertising spend. Every new campaign starts Draft / Planned Not Authorized.
                </div>

                {message ? <Message value={message} /> : null}

                <div className="flex justify-end gap-3 border-t border-[#E8DED1] pt-5">
                  <button type="button" onClick={() => setMode(null)} className="rounded-xl border border-black/[0.08] bg-white px-5 py-3 text-sm text-[#625B53]">Cancel</button>
                  <button
                    type="submit"
                    disabled={loading || !form.name.trim() || !form.objective.trim() || !selectedOrganizations.length}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-[#2B2118] disabled:opacity-40"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                    Create Campaign
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-6 p-6 lg:p-8">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-[#8A8178]">Campaign</div>
                  <div className="relative mt-3">
                    <select
                      value={selectedGroup?.id || ""}
                      onChange={(event) => setSelectedGroupId(event.target.value)}
                      className="w-full appearance-none rounded-2xl border border-black/[0.08] bg-white px-4 py-4 pr-10 text-sm text-[#2D2822] outline-none focus:border-[#D6A66A]/40"
                    >
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>{group.campaign_group_name}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8178]" />
                  </div>
                </div>

                {selectedGroup ? (
                  <div className="rounded-2xl border border-black/[0.07] bg-white p-5">
                    <div className="text-lg text-[#433C35]">{selectedGroup.campaign_group_name}</div>
                    <div className="mt-1 text-sm text-[#777169]">{selectedGroup.objective}</div>
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      {(selectedGroup.members || []).map((member) => (
                        <div key={member.id} className="rounded-xl border border-black/[0.07] bg-[#FCFBF8] px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.12em] text-[#D6A66A]">{member.organization?.name}</div>
                          <div className="mt-1 text-sm text-[#625B53]">{member.campaign?.campaign_name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-black/[0.07] bg-white p-6 text-sm text-[#8A8178]">No whole campaign available yet. Create one first.</div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    disabled={loading || !selectedGroup}
                    onClick={() => prepareWholeCampaign({ execute: false })}
                    className="rounded-2xl border border-[#D8B78D] bg-[#FBF4EA] p-5 text-left transition hover:bg-[#D6A66A]/15 disabled:opacity-40"
                  >
                    <Sparkles className="h-5 w-5 text-[#D6A66A]" />
                    <div className="mt-3 text-base font-semibold text-[#5D4129]">Prepare in Creative Studio</div>
                    <div className="mt-1 text-sm leading-relaxed text-[#777169]">Creates and starts real campaign-linked Creative Missions, projects and briefs for every organization.</div>
                  </button>
                  <button
                    type="button"
                    disabled={loading || !selectedGroup}
                    onClick={() => prepareWholeCampaign({ execute: true })}
                    className="rounded-2xl border border-emerald-700/15 bg-emerald-50 p-5 text-left transition hover:bg-emerald-500/[0.11] disabled:opacity-40"
                  >
                    <Megaphone className="h-5 w-5 text-emerald-300" />
                    <div className="mt-3 text-base font-semibold text-emerald-800">Start Creative Production</div>
                    <div className="mt-1 text-sm leading-relaxed text-[#777169]">Tells the Creative Director to execute. Provider/cost approval remains governed separately; advertising spend stays unauthorized.</div>
                  </button>
                </div>

                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-[#817B73]"><Loader2 className="h-4 w-4 animate-spin" /> Working through organization campaigns...</div>
                ) : null}

                {prepared.length ? (
                  <div className="space-y-2">
                    {prepared.map((item) => (
                      <div key={`${item.organizationName}-${item.campaignName}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/[0.07] bg-[#FCFBF8] px-4 py-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.12em] text-[#D6A66A]">{item.organizationName}</div>
                          <div className="mt-1 text-sm text-[#625B53]">{item.campaignName}</div>
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

function ChannelPicker({ selected = [], readiness, organizationId, onToggle, settings = {}, onSettingChange }) {
  const readyById = new Map((readiness?.channels || []).map((channel) => [channel.id, channel]));
  const providerReady = new Set(
    (readiness?.channels || [])
      .flatMap((channel) => channel.connected_provider_ids || [])
      .filter(Boolean),
  );

  function stateFor(channel) {
    const { catalogId, network } = pickerChannelTarget(channel.id);
    const row = readyById.get(catalogId);
    const runtimeState = String(row?.readiness_state || row?.catalog_runtime_status || "").toUpperCase();
    const connected = Boolean(
      row?.connected_provider_ids?.length ||
      providerReady.has(channel.provider) ||
      (channel.provider === "email" && ["email_google", "email_microsoft", "email_imap"].some((id) => providerReady.has(id))),
    );

    if (["IMPLEMENTATION_REQUIRED", "NOT_REGISTERED"].includes(runtimeState)) {
      return { ready: false, label: "Planned only", detail: row?.reasons?.[0] || "Execution is not available yet" };
    }

    const networkReady = !network || (row?.available_networks || []).includes(network);
    if (row?.available && networkReady) {
      return { ready: true, label: "Ready", detail: "Connected and executable" };
    }
    if (connected) {
      return { ready: false, label: "Connected", detail: network && !networkReady ? "This delivery network is not executable yet" : row?.reasons?.[0] || "Additional setup is required" };
    }
    return { ready: false, label: "Setup", detail: row?.reasons?.[0] || "Connect this channel before execution" };
  }

  const groups = ["Social", "Messaging", "Owned", "Discovery", "Paid", "Commerce", "Offline"];

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-[#8A8178]">Channels</div>
          <p className="mt-1 text-xs text-[#9B9289]">Choose where this campaign should run. Connection state comes from this organization.</p>
        </div>
        <div className="text-[11px] text-[#8A8178]">{selected.length} selected</div>
      </div>
      <div className="mt-4 space-y-5">
        {groups.map((group) => (
          <div key={group}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A37849]">{group}</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPAIGN_CHANNELS.filter((channel) => channel.group === group).map((channel) => {
                const active = selected.includes(channel.id);
                const state = stateFor(channel);
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => onToggle(channel.id)}
                    className={`flex min-h-[74px] items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${active ? "border-[#C99A62] bg-[#FBF3E8] shadow-[0_8px_30px_rgba(163,120,73,0.08)]" : "border-black/[0.07] bg-white hover:border-[#C9AD89]"}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/[0.06] bg-white p-2">
                      {channel.logo ? <Image src={channel.logo} alt="" width={28} height={28} className="h-full w-full object-contain" /> : <Megaphone className="h-5 w-5 text-[#A37849]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold text-[#3E3730]">{channel.name}</span>
                      <span title={state.detail || ""} className={`mt-1 block text-[9px] font-medium ${state.ready ? "text-emerald-700" : state.label === "Planned only" ? "text-[#8A8178]" : "text-[#A37849]"}`}>{state.label}</span>
                    </span>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? "border-[#C99A62] bg-[#C99A62] text-white" : "border-black/[0.10] text-transparent"}`}>
                      <Check className="h-3 w-3" />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 space-y-2">
              {CAMPAIGN_CHANNELS.filter((channel) => channel.group === group && selected.includes(channel.id)).map((channel) => (
                <ChannelSettings key={`${channel.id}-settings`} channel={channel} value={settings[channel.id] || {}} onChange={(key, value) => onSettingChange(channel.id, key, value)} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <a href={`/workspace/${organizationId}/administration/communications-setup?onboarding=1`} className="mt-4 inline-flex text-[10px] font-semibold text-[#8A633C] hover:underline">Manage channel connections →</a>
    </div>
  );
}

function ChannelSettings({ channel, value, onChange }) {
  const fields = {
    social: [["format","Format","Reel, Story, Post, Carousel"],["postingTime","Posting time","Automatic or time"],["captionMode","Caption","Automatic / custom"]],
    video: [["format","Format","Short, Video, Live"],["visibility","Visibility","Public / unlisted"],["playlist","Playlist","Optional"]],
    messaging: [["audience","Audience","Segment / list"],["template","Template","Approved template or freeform"],["sendWindow","Send window","Business hours / scheduled"]],
    email: [["sender","From mailbox","Connected sender"],["subject","Subject","Campaign subject"],["template","Template","Newsletter / promotion"],["audience","Recipient segment","Customer segment / list"]],
    push: [["audience","Audience","App / web segment"],["deepLink","Destination","Deep link / URL"],["schedule","Schedule","Immediate / scheduled"]],
    local: [["location","Business location","Connected location"],["postType","Post type","Update / offer / event"],["cta","CTA","Call / website / directions"]],
    meta_ads: [["destination","Destination","Engagement / Website / WhatsApp"],["networks","Delivery","Facebook / Instagram"],["optimization","Optimization","Engagement / clicks / conversations"],["placements","Placements","Automatic / manual"]],
    google_ads: [["account","Google Ads account","Connected advertiser account"],["keywords","Keywords","Comma separated"],["negativeKeywords","Negative keywords","Comma separated"],["headlines","Headlines","At least 3"],["descriptions","Descriptions","At least 2"],["landingPage","Landing page","https://..."]],
    paid: [["account","Ad account","Connected account"],["objective","Objective","Traffic / leads / sales / awareness"],["destination","Destination","Website / app / message"],["optimization","Optimization","Provider-specific"],["placements","Placements","Automatic / manual"]],
    commerce: [["marketplaces","Marketplaces","Shopify, Shopee, Lazada, Amazon…"],["catalog","Catalog","Product catalog / collection"],["destination","Destination","Product / purchase / booking"]],
    offline: [["type","Activation","Influencer, event, PR, QR, print, radio, outdoor…"],["owner","Owner / partner","Responsible person or partner"],["tracking","Tracking","QR / code / attribution method"]],
  }[channel.settings] || [];
  if (!fields.length) return null;
  return (
    <div className="rounded-2xl border border-[#D8C2A8] bg-[#FFFDF9] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold text-[#4A4138]">{channel.name} settings</div>
        <div className="text-[9px] uppercase tracking-[0.14em] text-[#A37849]">Per channel</div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {fields.map(([key,label,placeholder]) => (
          <label key={key} className="block">
            <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">{label}</span>
            <input value={value[key] || ""} onChange={(event) => onChange(key, event.target.value)} placeholder={placeholder} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none placeholder:text-[#B3AAA1] focus:border-[#D6A66A]/50" />
          </label>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required = false, helper = "" }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.14em] text-[#8A8178]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        min={type === "number" ? "0" : undefined}
        className="mt-2 w-full rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-sm text-[#2D2822] outline-none placeholder:text-[#B3AAA1] focus:border-[#D6A66A]/40"
      />
      {helper ? <span className="mt-1 block text-[11px] text-[#9B9289]">{helper}</span> : null}
    </label>
  );
}

function Message({ value }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white px-4 py-3 text-sm text-[#625B53]">
      {value}
    </div>
  );
}
