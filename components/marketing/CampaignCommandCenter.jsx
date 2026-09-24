"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { analyzeSmsSegments } from "@/lib/marketing/campaigns/SmsSegmentation";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Handshake,
  Loader2,
  Megaphone,
  MessageSquareText,
  MonitorUp,
  Plus,
  ShoppingBag,
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
  channels: [],
  startDate: "",
  endDate: "",
  masterBudget: "",
  organizationBudget: "",
  organizationBudgets: {},
  channelSettings: {},
  organizationChannelSettings: {},
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
  { id: "sms", name: "SMS", group: "Owned", logo: null, icon: MessageSquareText, provider: "sms", settings: "messaging" },
  { id: "push", name: "Push Notifications", group: "Owned", logo: null, icon: Bell, provider: "push", settings: "push" },
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
  { id: "programmatic", name: "Programmatic / CTV / DOOH", group: "Paid", logo: null, icon: MonitorUp, provider: "programmatic", settings: "paid" },
  { id: "marketplaces", name: "Commerce & Marketplaces", group: "Commerce", logo: null, icon: ShoppingBag, provider: "multi", settings: "commerce" },
  { id: "partnerships_offline", name: "Partnerships & Offline", group: "Offline", logo: null, icon: Handshake, provider: "manual", settings: "offline" },
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
  google_business: ["organic_social", "google_business"],
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

const EXPLICIT_PLANNING_ONLY_SURFACES = new Set(["messenger"]);

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

function organizationSpecificSetting(key) {
  return key.endsWith("AssetId") ||
    key === "recipientPartyIds" ||
    ["authorizedBudget", "dailyBudget", "bidCap", "costCap", "plannedBudget"].includes(key);
}

async function marketingCommand(payload) {
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

export default function CampaignCommandCenter({ allowMultiOrganization = false }) {
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
  const [readinessByOrganization, setReadinessByOrganization] = useState({});
  const [configurationOrganizationId, setConfigurationOrganizationId] = useState("");
  const [createStep, setCreateStep] = useState(0);

  const campaignArea = pathname?.includes("/commercial/marketing/campaigns");
  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || groups[0] || null,
    [groups, selectedGroupId],
  );

  const loadContext = useCallback(async () => {
    setContextLoading(true);
    setMessage("");
    try {
      const data = await marketingCommand({ action: "context", ownerOrganizationId });
      const rows = data?.organizations || [];
      setReadiness(data?.readiness || null);
      setReadinessByOrganization(data?.readiness_by_organization || {});
      setOrganizations(rows);
      setSelectedOrganizations((current) => {
        const defaultSelection = rows.some((row) => row.id === ownerOrganizationId)
          ? [ownerOrganizationId]
          : rows[0]?.id
            ? [rows[0].id]
            : [];
        if (!allowMultiOrganization) return defaultSelection;
        const retained = current.filter((id) => rows.some((row) => row.id === id));
        return retained.length ? retained : defaultSelection;
      });

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
  }, [allowMultiOrganization, mode, ownerOrganizationId]);

  useEffect(() => {
    if (!mode || !ownerOrganizationId) return;
    loadContext();
  }, [loadContext, mode, ownerOrganizationId]);

  useEffect(() => {
    setConfigurationOrganizationId((current) =>
      selectedOrganizations.includes(current)
        ? current
        : selectedOrganizations[0] || "",
    );
  }, [selectedOrganizations]);

  function toggleOrganization(id) {
    if (!allowMultiOrganization) return;
    setSelectedOrganizations((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleChannel(channelId) {
    setForm((current) => {
      const removing = current.channels.includes(channelId);
      const nextSettings = { ...(current.channelSettings || {}) };
      const nextOrganizationSettings = Object.fromEntries(
        Object.entries(current.organizationChannelSettings || {}).map(([organizationId, organizationSettings]) => {
          const next = { ...(organizationSettings || {}) };
          if (removing) delete next[channelId];
          return [organizationId, next];
        }),
      );
      if (removing) delete nextSettings[channelId];
      return {
        ...current,
        channels: removing
          ? current.channels.filter((id) => id !== channelId)
          : [...current.channels, channelId],
        channelSettings: nextSettings,
        organizationChannelSettings: nextOrganizationSettings,
      };
    });
  }

  async function createCampaign(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await marketingCommand({
        action: "create_campaign",
        ownerOrganizationId,
        organizationIds: selectedOrganizations,
        ...form,
        channels: form.channels,
        audienceSegments: splitList(form.audienceSegments),
        contentPillars: splitList(form.contentPillars),
        measurement: splitList(form.measurement),
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
        const data = await marketingCommand({
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

  const createSteps = ["Basics", "Audience & Creative", "Channels", "Budget & Schedule", "Review"];
  const multiOrganization = selectedOrganizations.length > 1;
  const activeConfigurationOrganizationId = multiOrganization
    ? configurationOrganizationId || selectedOrganizations[0] || ownerOrganizationId
    : ownerOrganizationId;
  const activeReadiness = readinessByOrganization[activeConfigurationOrganizationId] || readiness;
  const activeOrganizationName = organizations.find((row) => row.id === activeConfigurationOrganizationId)?.name || "Organization";
  const selectedOrganizationCurrencies = selectedOrganizations.map((id) => ({
    id,
    currency: String((readinessByOrganization[id] || readiness)?.time_context?.currency || "").toUpperCase() || null,
  }));
  const distinctOrganizationCurrencies = [...new Set(selectedOrganizationCurrencies.map((row) => row.currency).filter(Boolean))];
  const mixedOrganizationCurrencies = multiOrganization && distinctOrganizationCurrencies.length > 1;
  const campaignCurrency = !mixedOrganizationCurrencies ? distinctOrganizationCurrencies[0] || String(readiness?.time_context?.currency || "").toUpperCase() || null : null;

  function organizationBudgetFor(organizationId) {
    return mixedOrganizationCurrencies
      ? form.organizationBudgets?.[organizationId] || ""
      : form.organizationBudget;
  }

  function mergedChannelSettings(channelId, organizationId = activeConfigurationOrganizationId) {
    return {
      ...(form.channelSettings?.[channelId] || {}),
      ...(form.organizationChannelSettings?.[organizationId]?.[channelId] || {}),
    };
  }

  function setOrganizationChannelSetting(channelId, key, value) {
    setForm((current) => ({
      ...current,
      organizationChannelSettings: {
        ...(current.organizationChannelSettings || {}),
        [activeConfigurationOrganizationId]: {
          ...(current.organizationChannelSettings?.[activeConfigurationOrganizationId] || {}),
          [channelId]: {
            ...(current.organizationChannelSettings?.[activeConfigurationOrganizationId]?.[channelId] || {}),
            [key]: value,
          },
        },
      },
    }));
  }

  function stepValid(step) {
    if (step === 0) return Boolean(form.name.trim() && form.objective.trim() && selectedOrganizations.length);
    if (step === 2) return Boolean(form.channels.length);
    if (step === 3) {
      if (form.startDate && form.endDate && form.endDate < form.startDate) return false;
      if (selectedOrganizations.some((organizationId) => paidMediaAllocationIssues({
        ...form,
        organizationBudget: organizationBudgetFor(organizationId),
        channelSettings: Object.fromEntries(form.channels.map((channelId) => [channelId, mergedChannelSettings(channelId, organizationId)])),
      }).length)) return false;
      return true;
    }
    return true;
  }

  const allRequiredValid = createSteps.slice(0, 4).every((_, index) => stepValid(index));
  const metaSelected = form.channels.includes("meta_ads");
  const googleAdsSelected = form.channels.includes("google_ads");
  const organicExecutableSelected = form.channels.filter((channelId) => ["facebook", "instagram", "pinterest", "youtube", "linkedin", "threads", "tiktok", "x", "google_business"].includes(channelId));
  const ownedMessagingSelected = form.channels.filter((channelId) => ["email", "whatsapp", "line", "telegram", "sms"].includes(channelId));
  const detailedReviewChannels = new Set(["meta_ads", "google_ads", "facebook", "instagram", "pinterest", "youtube", "linkedin", "threads", "tiktok", "x", "google_business", "email", "whatsapp", "line", "telegram", "sms"]);
  const planningReviewSelected = form.channels.filter((channelId) => !detailedReviewChannels.has(channelId));

  if (!campaignArea) return null;

  return (
    <>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setPrepared([]);
            setMessage("");
            setCreateStep(0);
            setMode("create");
          }}
          className="inline-flex items-center gap-2 rounded-full border border-[#D2B187] bg-[#FBF4EA] px-4 py-2 text-sm font-semibold text-[#684A2E] transition hover:bg-[#F4E7D5]"
        >
          <Plus className="h-4 w-4" /> Create Campaign
        </button>
        {allowMultiOrganization ? (
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
        ) : null}
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
                    ? allowMultiOrganization
                      ? "Create one organization campaign or coordinate several organizations under one master campaign. All spend starts as planned, not authorized."
                      : "Create the organization campaign with its audience, channels, creative direction, schedule and governed spend controls. All spend starts as planned, not authorized."
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
              <form onSubmit={createCampaign} className="p-6 lg:p-8">
                <div className="mb-7 grid grid-cols-5 gap-2">
                  {createSteps.map((step, index) => {
                    const active = index === createStep;
                    const complete = index < createStep && stepValid(index);
                    return (
                      <button
                        key={step}
                        type="button"
                        onClick={() => {
                          if (index <= createStep || createSteps.slice(0, index).every((_, previous) => stepValid(previous))) {
                            setCreateStep(index);
                          }
                        }}
                        className={`rounded-xl border px-2 py-2.5 text-center text-[10px] font-medium transition ${active ? "border-[#C99A62] bg-[#FBF3E8] text-[#6B4C2E]" : complete ? "border-emerald-700/15 bg-emerald-50 text-emerald-700" : "border-black/[0.07] bg-white text-[#91877D]"}`}
                      >
                        <span className="block text-[9px] opacity-60">{index + 1}</span>
                        <span className="mt-0.5 block truncate">{step}</span>
                      </button>
                    );
                  })}
                </div>

                {createStep === 0 ? (
                  <div className="space-y-6">
                    {allowMultiOrganization && organizations.length > 1 ? (
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-[#8A8178]">Organizations</div>
                        <p className="mt-1 text-xs text-[#9B9289]">Select one business, or several only when this is genuinely one coordinated campaign.</p>
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
                    </div>
                  </div>
                ) : null}

                {createStep === 1 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Core Message" value={form.coreMessage} onChange={(value) => setForm((current) => ({ ...current, coreMessage: value }))} />
                    <Field label="Market" value={form.market} onChange={(value) => setForm((current) => ({ ...current, market: value }))} />
                    <Field label="Audience Approach" value={form.audienceApproach} onChange={(value) => setForm((current) => ({ ...current, audienceApproach: value }))} />
                    <Field label="Creative Direction" value={form.creativeDirection} onChange={(value) => setForm((current) => ({ ...current, creativeDirection: value }))} />
                    <Field label="Audience Segments" value={form.audienceSegments} onChange={(value) => setForm((current) => ({ ...current, audienceSegments: value }))} helper="Separate with commas" />
                    <Field label="Content Pillars" value={form.contentPillars} onChange={(value) => setForm((current) => ({ ...current, contentPillars: value }))} helper="Separate with commas" />
                    <div className="md:col-span-2">
                      <Field label="Success Metrics" value={form.measurement} onChange={(value) => setForm((current) => ({ ...current, measurement: value }))} helper="Examples: bookings, leads, ROAS, revenue" />
                    </div>
                  </div>
                ) : null}

                {createStep === 2 ? (
                  <div className="space-y-5">
                    {multiOrganization ? (
                      <div className="rounded-2xl border border-[#DCC8AE] bg-white p-4">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-[#A37849]">Configure connected accounts by organization</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedOrganizations.map((id) => {
                            const organization = organizations.find((row) => row.id === id);
                            const active = id === activeConfigurationOrganizationId;
                            return (
                              <button key={id} type="button" onClick={() => setConfigurationOrganizationId(id)} className={`rounded-full border px-3 py-2 text-xs transition ${active ? "border-[#C99A62] bg-[#FBF3E8] text-[#6B4C2E]" : "border-black/[0.08] bg-[#FCFBF8] text-[#625B53]"}`}>
                                {organization?.name || "Organization"}
                              </button>
                            );
                          })}
                        </div>
                        <p className="mt-3 text-xs leading-relaxed text-[#817B73]">Shared campaign strategy applies to every selected organization. Connected account, mailbox, sender and location selections below belong only to <strong>{activeOrganizationName}</strong>.</p>
                      </div>
                    ) : null}
                    <ChannelPicker
                      selected={form.channels}
                      readiness={activeReadiness}
                      organizationId={activeConfigurationOrganizationId}
                      onToggle={toggleChannel}
                      settings={form.channelSettings}
                      organizationSettings={form.organizationChannelSettings?.[activeConfigurationOrganizationId] || {}}
                      onSettingChange={(channelId, key, value) => setForm((current) => ({
                        ...current,
                        channelSettings: {
                          ...current.channelSettings,
                          [channelId]: { ...(current.channelSettings[channelId] || {}), [key]: value },
                        },
                      }))}
                      onOrganizationSettingChange={setOrganizationChannelSetting}
                      multiOrganization={multiOrganization}
                    />
                  </div>
                ) : null}

                {createStep === 3 ? (
                  <div className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      {!mixedOrganizationCurrencies ? (
                        <Field label={multiOrganization ? `Campaign Budget / Organization${campaignCurrency ? ` · ${campaignCurrency}` : ""}` : `Campaign Budget${campaignCurrency ? ` · ${campaignCurrency}` : ""}`} type="number" value={form.organizationBudget} onChange={(value) => setForm((current) => ({ ...current, organizationBudget: value }))} />
                      ) : null}
                      {multiOrganization && !mixedOrganizationCurrencies ? (
                        <Field label={`Master Campaign Budget${campaignCurrency ? ` · ${campaignCurrency}` : ""}`} type="number" value={form.masterBudget} onChange={(value) => setForm((current) => ({ ...current, masterBudget: value }))} />
                      ) : null}
                      {mixedOrganizationCurrencies ? (
                        <div className="md:col-span-2 rounded-2xl border border-[#DCC8AE] bg-white p-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A37849]">Budgets by organization</div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            {selectedOrganizations.map((organizationId) => {
                              const organization = organizations.find((row) => row.id === organizationId);
                              const currency = selectedOrganizationCurrencies.find((row) => row.id === organizationId)?.currency || "Currency not configured";
                              return <Field key={organizationId} label={`${organization?.name || "Organization"} · ${currency}`} type="number" value={form.organizationBudgets?.[organizationId] || ""} onChange={(value) => setForm((current) => ({ ...current, organizationBudgets: { ...(current.organizationBudgets || {}), [organizationId]: value } }))} />;
                            })}
                          </div>
                          <div className="mt-3 text-xs leading-relaxed text-[#817B73]">Currencies differ, so Avantiqo keeps each organization budget separate. No master monetary total is calculated across currencies.</div>
                        </div>
                      ) : null}
                      <Field label="Start Date" type="date" value={form.startDate} onChange={(value) => setForm((current) => ({ ...current, startDate: value }))} />
                      <Field label="End Date" type="date" value={form.endDate} onChange={(value) => setForm((current) => ({ ...current, endDate: value }))} />
                    </div>
                    {form.startDate && form.endDate && form.endDate < form.startDate ? (
                      <div className="rounded-2xl border border-red-700/15 bg-red-50 px-4 py-3 text-sm text-red-800">End date must be the same as or later than the start date.</div>
                    ) : null}
                    {selectedOrganizations.flatMap((organizationId) => paidMediaAllocationIssues({
                      ...form,
                      organizationBudget: organizationBudgetFor(organizationId),
                      channelSettings: Object.fromEntries(form.channels.map((channelId) => [channelId, mergedChannelSettings(channelId, organizationId)])),
                    }).map((issue) => ({ organizationId, issue }))).length ? (
                      <div className="rounded-2xl border border-red-700/15 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <div className="font-semibold">Paid-media budget needs attention</div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{selectedOrganizations.flatMap((organizationId) => { const organization = organizations.find((row) => row.id === organizationId); return paidMediaAllocationIssues({ ...form, organizationBudget: organizationBudgetFor(organizationId), channelSettings: Object.fromEntries(form.channels.map((channelId) => [channelId, mergedChannelSettings(channelId, organizationId)])) }).map((issue) => <li key={`${organizationId}-${issue}`}>{multiOrganization ? `${organization?.name || "Organization"}: ` : ""}{issue}</li>); })}</ul>
                      </div>
                    ) : null}
                    <div className="rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] px-4 py-3 text-sm text-[#7A5A36]">
                      Budget here is planning data only. Creating the campaign does not authorize advertising spend.
                    </div>
                  </div>
                ) : null}

                {createStep === 4 ? (
                  <div className="space-y-5">
                    <div className="rounded-[24px] border border-black/[0.07] bg-white p-5">
                      <div className="text-xs uppercase tracking-[0.16em] text-[#D6A66A]">Review Campaign</div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <ReviewItem label="Name" value={form.name || "—"} />
                        <ReviewItem label="Objective" value={form.objective || "—"} />
                        <ReviewItem label={multiOrganization ? "Organizations" : "Organization"} value={selectedOrganizations.map((id) => organizations.find((row) => row.id === id)?.name || id).join(", ") || "—"} />
                        <ReviewItem label="Channels" value={form.channels.map((id) => CAMPAIGN_CHANNELS.find((channel) => channel.id === id)?.name || id).join(", ") || "—"} />
                        <ReviewItem label="Campaign Budget" value={mixedOrganizationCurrencies ? selectedOrganizations.map((id) => { const organization = organizations.find((row) => row.id === id); const currency = selectedOrganizationCurrencies.find((row) => row.id === id)?.currency || "—"; const value = form.organizationBudgets?.[id]; return `${organization?.name || "Organization"}: ${value ? `${currency} ${Number(value).toLocaleString()}` : "Not set"}`; }).join(" · ") : form.organizationBudget ? `${campaignCurrency || ""} ${Number(form.organizationBudget).toLocaleString()}${multiOrganization ? " / organization" : " total"}`.trim() : "Not set"} />
                        {multiOrganization && !mixedOrganizationCurrencies ? <ReviewItem label="Master Campaign Budget" value={form.masterBudget ? `${campaignCurrency || ""} ${Number(form.masterBudget).toLocaleString()} total`.trim() : "Not set"} /> : null}
                        <ReviewItem label="Period" value={form.startDate || form.endDate ? `${form.startDate || "Open"} → ${form.endDate || "Open"}` : "No dates set"} />
                        <ReviewItem label="Spend State" value="Draft · Planned Not Authorized" />
                      </div>
                      <div className="mt-5 border-t border-black/[0.06] pt-5">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-[#9B9289]">{multiOrganization ? "Channel readiness by organization" : "Channel readiness"}</div>
                        <div className="mt-3 space-y-2">
                          {selectedOrganizations.map((organizationId) => {
                            const organization = organizations.find((row) => row.id === organizationId);
                            const organizationReadiness = readinessByOrganization[organizationId] || readiness;
                            const states = form.channels.map((channelId) => {
                              const channel = CAMPAIGN_CHANNELS.find((item) => item.id === channelId);
                              return channel ? { channel, state: campaignSurfaceState(channel, organizationReadiness) } : null;
                            }).filter(Boolean);
                            const readyCount = states.filter((item) => item.state.ready).length;
                            const plannedOnlyCount = states.filter((item) => item.state.label === "Planned only").length;
                            const setupCount = states.length - readyCount - plannedOnlyCount;
                            return (
                              <div key={organizationId} className="rounded-2xl border border-black/[0.06] bg-[#FCFBF8] p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="text-sm font-medium text-[#4A4138]">{organization?.name || "Organization"}</div>
                                  <div className="flex flex-wrap gap-2 text-[9px] font-semibold uppercase tracking-[0.08em]">
                                    <span className="rounded-full border border-emerald-700/15 bg-emerald-50 px-2.5 py-1 text-emerald-700">{readyCount} ready</span>
                                    {setupCount ? <span className="rounded-full border border-[#DDBA8B] bg-[#FFF8EC] px-2.5 py-1 text-[#7A5A36]">{setupCount} setup</span> : null}
                                    {plannedOnlyCount ? <span className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[#7B7168]">{plannedOnlyCount} planned only</span> : null}
                                  </div>
                                </div>
                                {setupCount ? (
                                  <div className="mt-2 text-[10px] leading-relaxed text-[#817B73]">Setup needed: {states.filter((item) => !item.state.ready && item.state.label !== "Planned only").map((item) => item.channel.name).join(", ")}</div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    {metaSelected ? (
                      <div className="space-y-3">
                        {selectedOrganizations.map((organizationId) => {
                          const organization = organizations.find((row) => row.id === organizationId);
                          const organizationReadiness = readinessByOrganization[organizationId] || readiness;
                          return (
                            <MetaReview
                              key={organizationId}
                              organizationName={organization?.name || "Organization"}
                              settings={mergedChannelSettings("meta_ads", organizationId)}
                              creativeAssets={organizationReadiness?.creative_assets || []}
                              channelAssets={organizationReadiness?.channel_assets || []}
                              currency={organizationReadiness?.time_context?.currency || organizationReadiness?.wallet?.currency || ""}
                            />
                          );
                        })}
                      </div>
                    ) : null}
                    {metaSelected ? (
                      <div className="space-y-2">
                        {selectedOrganizations.map((organizationId) => {
                          const organization = organizations.find((row) => row.id === organizationId);
                          const organizationReadiness = readinessByOrganization[organizationId] || readiness;
                          const issues = metaSettingsIssues(mergedChannelSettings("meta_ads", organizationId), {
                            startDate: form.startDate,
                            endDate: form.endDate,
                            budget: resolvedProviderBudget({ ...form, organizationBudget: organizationBudgetFor(organizationId), channelSettings: { ...form.channelSettings, meta_ads: mergedChannelSettings("meta_ads", organizationId) } }, "meta_ads"),
                            creativeAssets: organizationReadiness?.creative_assets || [],
                            channelAssets: organizationReadiness?.channel_assets || [],
                          });
                          return (
                            <div key={organizationId} className={`rounded-2xl border px-4 py-3 text-sm ${issues.length ? "border-[#DDBA8B] bg-[#FFF8EC] text-[#7A5A36]" : "border-emerald-700/15 bg-emerald-50 text-emerald-800"}`}>
                              <div className="font-semibold">Meta campaign check · {organization?.name || "Organization"}</div>
                              {issues.length ? (
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                              ) : (
                                <div className="mt-1 text-xs">This Meta campaign has the required information for the final connection check. Owner approval is still required before any advertising spend or campaign creation.</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    {googleAdsSelected ? (
                      <div className="space-y-3">
                        {selectedOrganizations.map((organizationId) => {
                          const organization = organizations.find((row) => row.id === organizationId);
                          const organizationReadiness = readinessByOrganization[organizationId] || readiness;
                          return (
                            <GoogleAdsReview
                              key={organizationId}
                              organizationName={organization?.name || "Organization"}
                              settings={mergedChannelSettings("google_ads", organizationId)}
                              assets={assetsForSurface(CAMPAIGN_CHANNELS.find((channel) => channel.id === "google_ads"), organizationReadiness?.channel_assets || [])}
                              currency={organizationReadiness?.time_context?.currency || organizationReadiness?.wallet?.currency || ""}
                            />
                          );
                        })}
                      </div>
                    ) : null}
                    {googleAdsSelected ? (
                      <div className="space-y-2">
                        {selectedOrganizations.map((organizationId) => {
                          const organization = organizations.find((row) => row.id === organizationId);
                          const organizationReadiness = readinessByOrganization[organizationId] || readiness;
                          const issues = googleAdsSettingsIssues(mergedChannelSettings("google_ads", organizationId), {
                            startDate: form.startDate,
                            endDate: form.endDate,
                            budget: resolvedProviderBudget({ ...form, organizationBudget: organizationBudgetFor(organizationId), channelSettings: { ...form.channelSettings, google_ads: mergedChannelSettings("google_ads", organizationId) } }, "google_ads"),
                            assets: assetsForSurface(CAMPAIGN_CHANNELS.find((channel) => channel.id === "google_ads"), organizationReadiness?.channel_assets || []),
                          });
                          return (
                            <div key={organizationId} className={`rounded-2xl border px-4 py-3 text-sm ${issues.length ? "border-[#DDBA8B] bg-[#FFF8EC] text-[#7A5A36]" : "border-emerald-700/15 bg-emerald-50 text-emerald-800"}`}>
                              <div className="font-semibold">Google Ads campaign check · {organization?.name || "Organization"}</div>
                              {issues.length ? (
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                              ) : (
                                <div className="mt-1 text-xs">This Google Search campaign has the required information for the final connection check. Owner approval is still required before any advertising spend.</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    {organicExecutableSelected.length ? (
                      <div className="space-y-3">
                        {selectedOrganizations.flatMap((organizationId) => {
                          const organization = organizations.find((row) => row.id === organizationId);
                          const organizationReadiness = readinessByOrganization[organizationId] || readiness;
                          return organicExecutableSelected.map((channelId) => {
                            const channel = CAMPAIGN_CHANNELS.find((item) => item.id === channelId);
                            const settings = mergedChannelSettings(channelId, organizationId);
                            const channelAssets = assetsForSurface(channel, organizationReadiness?.channel_assets || []);
                            const state = campaignSurfaceState(channel, organizationReadiness);
                            const issues = organicSocialSettingsIssues(channelId, settings, {
                              assets: channelAssets,
                              creativeAssets: organizationReadiness?.creative_assets || [],
                              coreMessage: form.coreMessage,
                              state,
                            });
                            return (
                              <div key={`${organizationId}-${channelId}`} className="space-y-2">
                                <OrganicSocialReview
                                  organizationName={organization?.name || "Organization"}
                                  channelId={channelId}
                                  settings={settings}
                                  assets={channelAssets}
                                  creativeAssets={organizationReadiness?.creative_assets || []}
                                  coreMessage={form.coreMessage}
                                  state={state}
                                />
                                <div className={`rounded-2xl border px-4 py-3 text-sm ${issues.length ? "border-[#DDBA8B] bg-[#FFF8EC] text-[#7A5A36]" : "border-emerald-700/15 bg-emerald-50 text-emerald-800"}`}>
                                  <div className="font-semibold">{channel?.name || channelId} campaign check · {organization?.name || "Organization"}</div>
                                  {issues.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <div className="mt-1 text-xs">Account, content and channel setup are ready for the final connection check. Explicit owner approval is still required before publishing.</div>}
                                </div>
                              </div>
                            );
                          });
                        })}
                      </div>
                    ) : null}
                    {ownedMessagingSelected.length ? (
                      <div className="space-y-3">
                        {selectedOrganizations.flatMap((organizationId) => {
                          const organization = organizations.find((row) => row.id === organizationId);
                          const organizationReadiness = readinessByOrganization[organizationId] || readiness;
                          return ownedMessagingSelected.map((channelId) => {
                            const channel = CAMPAIGN_CHANNELS.find((item) => item.id === channelId);
                            return (
                              <OwnedMessagingReview
                                key={`${organizationId}-${channelId}`}
                                organizationName={organization?.name || "Organization"}
                                channel={channel}
                                settings={mergedChannelSettings(channelId, organizationId)}
                                assets={assetsForSurface(channel, organizationReadiness?.channel_assets || [])}
                                state={campaignSurfaceState(channel, organizationReadiness)}
                              />
                            );
                          });
                        })}
                      </div>
                    ) : null}
                    {planningReviewSelected.length ? (
                      <div className="space-y-3">
                        {selectedOrganizations.flatMap((organizationId) => {
                          const organization = organizations.find((row) => row.id === organizationId);
                          const organizationReadiness = readinessByOrganization[organizationId] || readiness;
                          return planningReviewSelected.map((channelId) => {
                            const channel = CAMPAIGN_CHANNELS.find((item) => item.id === channelId);
                            return (
                              <PlanningChannelReview
                                key={`${organizationId}-${channelId}`}
                                organizationName={organization?.name || "Organization"}
                                channel={channel}
                                settings={mergedChannelSettings(channelId, organizationId)}
                                assets={assetsForSurface(channel, organizationReadiness?.channel_assets || [])}
                                state={campaignSurfaceState(channel, organizationReadiness)}
                              />
                            );
                          });
                        })}
                      </div>
                    ) : null}
                    <div className="rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] px-4 py-3 text-sm leading-relaxed text-[#7A5A36]">
                      This creates the campaign plan only. Publishing, provider execution and paid-media spend remain governed by their own readiness and approval controls.
                    </div>
                  </div>
                ) : null}

                {message ? <div className="mt-5"><Message value={message} /></div> : null}

                <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#E8DED1] pt-5">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setMode(null)} className="rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-sm text-[#625B53]">Cancel</button>
                    {createStep > 0 ? (
                      <button type="button" onClick={() => setCreateStep((step) => Math.max(0, step - 1))} className="inline-flex items-center gap-1 rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-sm text-[#625B53]">
                        <ChevronLeft className="h-4 w-4" /> Back
                      </button>
                    ) : null}
                  </div>
                  {createStep < createSteps.length - 1 ? (
                    <button type="button" disabled={!stepValid(createStep)} onClick={() => setCreateStep((step) => Math.min(createSteps.length - 1, step + 1))} className="inline-flex items-center gap-1 rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-[#2B2118] disabled:opacity-40">
                      Continue <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button type="submit" disabled={loading || !allRequiredValid} className="inline-flex items-center gap-2 rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-[#2B2118] disabled:opacity-40">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                      Create Campaign
                    </button>
                  )}
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

function paidMediaAllocationIssues(form = {}) {
  const selected = ["meta_ads", "google_ads"].filter((channel) => form.channels?.includes(channel));
  if (!selected.length) return [];
  const total = Number(form.organizationBudget || 0);
  const issues = [];
  if (!(total > 0)) issues.push("Paid media requires a positive Campaign Budget.");
  const allocations = selected.map((channel) => ({
    channel,
    amount: Number(form.channelSettings?.[channel]?.authorizedBudget || 0),
  }));
  if (selected.length > 1) {
    for (const allocation of allocations) {
      if (!(allocation.amount > 0)) issues.push(`${allocation.channel === "meta_ads" ? "Meta" : "Google Ads"} needs an explicit provider budget allocation.`);
    }
  }
  const allocated = allocations.reduce((sum, item) => sum + (item.amount > 0 ? item.amount : 0), 0);
  if (allocated > total && total > 0) issues.push("Provider budget allocations cannot exceed the Campaign Budget.");
  return issues;
}

function resolvedProviderBudget(form = {}, channelId) {
  const selected = ["meta_ads", "google_ads"].filter((channel) => form.channels?.includes(channel));
  const explicit = Number(form.channelSettings?.[channelId]?.authorizedBudget || 0);
  if (explicit > 0) return explicit;
  return selected.length === 1 ? Number(form.organizationBudget || 0) : 0;
}

function organicSocialSettingsIssues(channelId, settings = {}, { assets = [], creativeAssets = [], coreMessage = "", state = null } = {}) {
  const issues = [];
  const channelName = channelId === "facebook" ? "Facebook" : channelId === "instagram" ? "Instagram" : channelId === "pinterest" ? "Pinterest" : channelId === "youtube" ? "YouTube" : channelId === "linkedin" ? "LinkedIn" : channelId === "threads" ? "Threads" : channelId === "tiktok" ? "TikTok" : channelId === "google_business" ? "Google Business" : "X";
  const accountAssetId = channelId === "google_business" ? settings.locationAssetId : settings.accountAssetId;
  const selectedAsset = assets.find((asset) => asset.id === accountAssetId);
  if (!state?.ready) issues.push(state?.detail || `${channelName} is not currently executable.`);
  if (!selectedAsset) issues.push(channelId === "google_business" ? "Select the mapped Google Business location." : "Select the connected organization publishing account.");
  if (channelId === "google_business" && selectedAsset && !selectedAsset.entity_id) issues.push("Google Business location must be mapped to an Avantiqo legal entity.");
  if (!String(settings.message || coreMessage || "").trim() && !["youtube", "pinterest"].includes(channelId)) issues.push("Add a campaign core message or a channel-specific message.");
  if (settings.creativeAssetId) {
    const creative = creativeAssets.find((asset) => asset.id === settings.creativeAssetId);
    if (!creative || creative.approval_status !== "APPROVED") issues.push("Selected creative is not an approved organization asset.");
    else {
      const kind = String(creative.media_kind || "").toUpperCase();
      const allowed = ["facebook", "instagram", "pinterest", "linkedin", "google_business"].includes(channelId) ? ["IMAGE"] : ["tiktok", "youtube"].includes(channelId) ? ["VIDEO"] : ["IMAGE", "VIDEO"];
      if (!allowed.includes(kind)) issues.push(`${channelName} does not support the selected creative type in the current campaign adapter.`);
    }
  }
  if (["facebook", "instagram", "pinterest"].includes(channelId) && !settings.creativeAssetId) issues.push(`${channelName} requires one approved organization image in the current campaign adapter.`);
  if (channelId === "youtube" && !settings.creativeAssetId) issues.push("YouTube requires one approved organization video.");
  if (channelId === "youtube" && !String(settings.title || "").trim()) issues.push("YouTube requires a video title.");
  if (channelId === "youtube" && String(settings.title || "").length > 100) issues.push("YouTube title cannot exceed 100 characters.");
  if (channelId === "youtube" && String(settings.description || "").length > 5000) issues.push("YouTube description cannot exceed 5,000 characters.");
  if (channelId === "pinterest" && !String(settings.boardId || "").trim()) issues.push("Pinterest requires a selected board.");
  if (channelId === "pinterest" && String(settings.title || "").length > 100) issues.push("Pinterest title cannot exceed 100 characters.");
  if (channelId === "pinterest" && String(settings.description || "").length > 800) issues.push("Pinterest description cannot exceed 800 characters.");
  if (channelId === "tiktok") {
    if (settings.creatorConsent !== true) issues.push("Explicit TikTok creator consent is required.");
    if (!settings.privacyLevel) issues.push("Load TikTok creator options and select a current privacy level.");
    if (!settings.creativeAssetId) issues.push("TikTok requires one approved organization video.");
  }
  if (channelId === "google_business" && String(settings.message || coreMessage || "").length > 1500) issues.push("Google Business post text cannot exceed 1500 characters.");
  if (channelId === "google_business" && settings.callToActionType && !settings.destinationUrl) issues.push("Google Business call to action requires a destination URL.");
  if (channelId === "pinterest" && settings.destinationUrl) {
    try {
      const url = new URL(settings.destinationUrl);
      if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(url.hostname) || url.hostname.endsWith(".local")) issues.push("Pinterest destination link must be a public HTTPS URL.");
    } catch { issues.push("Pinterest destination link is not valid."); }
  }
  if (settings.destinationUrl && channelId !== "pinterest") {
    try {
      const url = new URL(settings.destinationUrl);
      if (!["http:", "https:"].includes(url.protocol)) issues.push("Destination URL must use HTTP or HTTPS.");
    } catch {
      issues.push("Destination URL is not valid.");
    }
  }
  return [...new Set(issues)];
}

function googleAdsSettingsIssues(settings = {}, { startDate = "", endDate = "", budget = "", assets = [] } = {}) {
  const issues = [];
  const headlines = textareaLines(settings.headlines);
  const descriptions = textareaLines(settings.descriptions);
  const keywords = [
    ...textareaLines(settings.exactKeywords),
    ...textareaLines(settings.phraseKeywords),
    ...textareaLines(settings.broadKeywords),
  ];
  const account = assets.find((asset) => asset.id === settings.accountAssetId);
  if (!account) issues.push("Select a mapped Google Ads spending account.");
  if (!Number(budget || 0)) issues.push("Google Search requires a positive authorized campaign budget.");
  if (!startDate || !endDate) issues.push("Google Search requires both start and end dates.");
  if (startDate && endDate && endDate <= startDate) issues.push("Google Search end date must be after the start date.");
  if (!Array.isArray(settings.includedLocations) || !settings.includedLocations.length) issues.push("Google Search requires at least one included location target.");
  if (!keywords.length) issues.push("Add at least one executable Search keyword.");
  if (headlines.length < 3 || headlines.length > 15) issues.push("Responsive Search Ads require 3–15 headlines.");
  if (headlines.some((headline) => headline.length > 30)) issues.push("Google Ads headlines cannot exceed 30 characters.");
  if (descriptions.length < 2 || descriptions.length > 4) issues.push("Responsive Search Ads require 2–4 descriptions.");
  if (descriptions.some((description) => description.length > 90)) issues.push("Google Ads descriptions cannot exceed 90 characters.");
  if (!String(settings.landingPage || "").trim()) issues.push("Google Search requires a landing-page URL.");
  else {
    try {
      const url = new URL(settings.landingPage);
      if (!["http:", "https:"].includes(url.protocol)) issues.push("Google Ads landing page must use HTTP or HTTPS.");
    } catch {
      issues.push("Google Ads landing page is not a valid URL.");
    }
  }
  if (settings.dailyBudget && Number(settings.dailyBudget) > Number(budget || 0)) issues.push("Daily Google Ads budget cannot exceed the authorized campaign budget.");
  return issues;
}

function metaSettingsIssues(settings = {}, { startDate = "", endDate = "", budget = "", creativeAssets = [], channelAssets = [] } = {}) {
  const issues = [];
  const ageMin = Number(settings.ageMin || 18);
  const ageMax = Number(settings.ageMax || 65);
  const networks = splitList(settings.networks);
  const includedCountries = splitList(settings.includedCountries);
  const includedRegions = splitList(settings.includedRegionIds);
  const includedCities = splitList(settings.includedCityIds);
  const includedPostal = splitList(settings.includedPostalIds);
  const hasRadius = Boolean(settings.radiusLatitude && settings.radiusLongitude && settings.radius);
  const selectedAsset = creativeAssets.find((asset) => asset.id === (settings.creativeAssetId || settings.assetId));

  if (ageMin < 18 || ageMax < ageMin) issues.push("Use a valid Meta age range starting at 18.");
  if (!networks.length) issues.push("Choose Facebook, Instagram, or both for delivery.");
  if (!networks.includes("facebook") && splitList(settings.facebookPositions).length) issues.push("Facebook placements are configured but Facebook delivery is not selected.");
  if (!networks.includes("instagram") && splitList(settings.instagramPositions).length) issues.push("Instagram placements are configured but Instagram delivery is not selected.");
  const pageAsset = channelAssets.find((asset) => asset.id === settings.pageAssetId && asset.asset_type === "facebook_page");
  const instagramAsset = channelAssets.find((asset) => asset.id === settings.instagramAssetId && asset.asset_type === "instagram_business");
  if (!pageAsset) issues.push("Select the exact Facebook Page identity for this Meta campaign.");
  if (networks.includes("instagram")) {
    if (!instagramAsset) issues.push("Select the exact linked Instagram professional account for Instagram delivery.");
    else if (pageAsset && String(instagramAsset.metadata?.facebook_page_id || "") !== String(pageAsset.external_id || "")) issues.push("The selected Instagram account is not linked to the selected Facebook Page.");
  }
  if (!includedCountries.length && !includedRegions.length && !includedCities.length && !includedPostal.length && !hasRadius) issues.push("Add at least one executable included location.");
  if (String(settings.destination || "ENGAGEMENT").toUpperCase() === "WEBSITE" && !String(settings.destinationUrl || "").trim()) issues.push("Website campaigns require a destination URL.");
  const destination = String(settings.destination || "ENGAGEMENT").toUpperCase();
  const compatibility = metaCompatibility(destination);
  const objective = String(settings.objective || "").toUpperCase();
  const optimization = String(settings.optimizationGoal || "").toUpperCase();
  const billingEvent = String(settings.billingEvent || "IMPRESSIONS").toUpperCase();
  if (objective && !compatibility.objectives.some(([id]) => id === objective)) issues.push(`Meta objective ${objective} is not compatible with ${destination}.`);
  if (optimization && !compatibility.optimizations.some(([id]) => id === optimization)) issues.push(`Meta optimization ${optimization} is not compatible with ${destination}.`);
  if (billingEvent === "LINK_CLICKS" && optimization !== "LINK_CLICKS") issues.push("Link-click billing requires Link Clicks optimization in the current managed Meta adapter.");
  if (optimization === "OFFSITE_CONVERSIONS") {
    if (!String(settings.pixelId || "").trim()) issues.push("Website conversion optimization requires a Meta Pixel.");
    if (!String(settings.conversionEvent || "").trim()) issues.push("Website conversion optimization requires a conversion event.");
  }
  if (!startDate) issues.push("Meta campaigns require a start date.");
  if (!endDate) issues.push("Meta campaigns require an end date.");
  const authorizedBudget = Number(budget || 0);
  if (!authorizedBudget) issues.push("Meta campaigns require a positive campaign budget.");
  const budgetMode = String(settings.budgetMode || "lifetime").toLowerCase();
  if (budgetMode === "daily") {
    const dailyBudget = Number(settings.dailyBudget || 0);
    if (!(dailyBudget > 0)) issues.push("Daily Meta budget mode requires a positive daily budget.");
    if (startDate && endDate && dailyBudget > 0 && authorizedBudget > 0) {
      const durationDays = Math.max(1, Math.ceil((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86400000) + 1);
      if (dailyBudget * durationDays > authorizedBudget + 0.000001) issues.push("Meta daily budget across the campaign period exceeds the authorized Meta allocation.");
    }
  } else if (budgetMode !== "lifetime") {
    issues.push("Meta budget mode must be Lifetime or Daily.");
  }
  if (splitList(settings.specialAdCategories).length) issues.push("Special Ad Category campaigns remain draft-only until Avantiqo special-ad compliance certification is active for the organization and market.");
  if (!String(settings.primaryText || "").trim()) issues.push("Meta creative requires primary text.");
  if (!selectedAsset) issues.push("Select one exact approved image creative asset.");
  else if (selectedAsset.approval_status !== "APPROVED") issues.push("The selected creative asset is not approved.");
  else if (String(selectedAsset.media_kind || "").toUpperCase() !== "IMAGE") issues.push("The current managed Meta Ads adapter requires an approved image creative.");
  return issues;
}

function campaignSurfaceState(channel, readiness) {
  if (EXPLICIT_PLANNING_ONLY_SURFACES.has(channel.id)) {
    return {
      ready: false,
      label: "Planned only",
      detail: `${channel.name} campaign execution is not certified yet`,
      blockers: [`${channel.name} campaign execution adapter is not active`],
    };
  }
  const readyById = new Map((readiness?.channels || []).map((item) => [item.id, item]));
  const providerReady = new Set(
    (readiness?.channels || [])
      .flatMap((item) => item.connected_provider_ids || [])
      .filter(Boolean),
  );
  const { catalogId, network } = pickerChannelTarget(channel.id);
  const row = readyById.get(catalogId);
  const runtimeState = String(row?.readiness_state || row?.catalog_runtime_status || "").toUpperCase();
  const connected = Boolean(
    row?.connected_provider_ids?.length ||
    providerReady.has(channel.provider) ||
    (channel.provider === "email" && ["email_google", "email_microsoft", "email_imap"].some((id) => providerReady.has(id))),
  );

  if (["IMPLEMENTATION_REQUIRED", "NOT_REGISTERED", "PLANNING_ONLY"].includes(runtimeState)) {
    return { ready: false, label: "Planned only", detail: row?.reasons?.[0] || "Execution is not available yet", blockers: row?.reasons || [] };
  }

  const networkReady = !network || (row?.available_networks || []).includes(network);
  if (row?.available && networkReady) {
    return { ready: true, label: "Ready", detail: "Connected and executable", blockers: [] };
  }
  const networkState = network
    ? row?.details?.network_states?.find((item) => item.network === network)
    : null;
  const networkBlocker = networkState && !networkReady
    ? !networkState.connected
      ? `Connect ${channel.name} before execution`
      : networkState.asset_ready === false
        ? `Select or reconnect the ${channel.name} organization asset`
        : String(networkState.service_status || "").toUpperCase() !== "ACTIVE"
          ? `Enable the ${channel.name} organization service`
          : networkState.pricing_ready === false
            ? networkState.pricing_error || `${channel.name} pricing route is not ready`
            : "This delivery network is not executable yet"
    : null;
  if (connected) {
    return { ready: false, label: "Connected", detail: networkBlocker || row?.reasons?.[0] || "Additional setup is required" };
  }
  return { ready: false, label: "Setup", detail: row?.reasons?.[0] || "Connect this channel before execution", blockers: row?.reasons || [] };
}

function assetsForSurface(channel, rows = []) {
  const allowed = {
    facebook: [["meta", "facebook_page"]],
    instagram: [["meta", "instagram_business"]],
    messenger: [["meta", "facebook_page"]],
    threads: [["threads", "threads_profile"]],
    tiktok: [["tiktok", "tiktok_account"]],
    youtube: [["youtube", "youtube_channel"]],
    linkedin: [["linkedin", "linkedin_identity"]],
    x: [["x", "x_account"]],
    pinterest: [["pinterest", "pinterest_account"]],
    whatsapp: [["whatsapp", "whatsapp_phone_number"]],
    line: [["line", "line_official_account"], ["line", "line_account"]],
    telegram: [["telegram", "telegram_bot"]],
    email: [["email_google", "business_mailbox"], ["email_microsoft", "business_mailbox"], ["email", "business_mailbox"]],
    sms: [["sms", "sms_sender"]],
    google_business: [["google", "google_business_location"]],
    tripadvisor: [["tripadvisor", "tripadvisor_location"]],
    google_ads: [["google_ads", "google_ads_customer"]],
    meta_ads: [["meta", "facebook_page"], ["meta", "instagram_business"]],
  }[channel.id] || [[channel.provider, null]];

  return (rows || []).filter((asset) =>
    allowed.some(([provider, type]) =>
      asset.provider === provider && (!type || asset.asset_type === type),
    ),
  ).filter((asset) => asset.metadata?.manager !== true);
}

function ChannelPicker({ selected = [], readiness, organizationId, onToggle, settings = {}, organizationSettings = {}, onSettingChange, onOrganizationSettingChange, multiOrganization = false }) {
  const readyById = new Map((readiness?.channels || []).map((channel) => [channel.id, channel]));
  const stateFor = (channel) => campaignSurfaceState(channel, readiness);

  const groups = ["Social", "Messaging", "Owned", "Discovery", "Paid", "Commerce", "Offline"];
  const [activeGroup, setActiveGroup] = useState("All");
  const [activeSettingsChannelId, setActiveSettingsChannelId] = useState("");
  const visibleGroups = activeGroup === "All" ? groups : groups.filter((group) => group === activeGroup);
  const selectedChannels = selected.map((id) => CAMPAIGN_CHANNELS.find((channel) => channel.id === id)).filter(Boolean);
  const selectedStates = selectedChannels.map((channel) => ({ channel, state: stateFor(channel) }));
  const selectedReadyCount = selectedStates.filter((item) => item.state.ready).length;
  const selectedPlanningCount = selectedStates.filter((item) => item.state.label === "Planned only").length;
  const selectedSetupCount = selectedStates.length - selectedReadyCount - selectedPlanningCount;
  const activeSettingsChannel = selectedChannels.find((channel) => channel.id === activeSettingsChannelId) || selectedChannels[0] || null;

  useEffect(() => {
    if (!selected.length) {
      setActiveSettingsChannelId("");
      return;
    }
    if (!selected.includes(activeSettingsChannelId)) setActiveSettingsChannelId(selected[0]);
  }, [activeSettingsChannelId, selected]);

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-[#8A8178]">Channels</div>
          <p className="mt-1 text-xs text-[#9B9289]">Choose where this campaign should run. Connection state comes from this organization.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 text-[10px]">
          <span className="rounded-full border border-black/[0.07] bg-white px-2.5 py-1 text-[#6F675F]">{selected.length} selected</span>
          {selected.length ? <span className="rounded-full border border-emerald-700/15 bg-emerald-50 px-2.5 py-1 text-emerald-700">{selectedReadyCount} ready</span> : null}
          {selectedSetupCount ? <span className="rounded-full border border-[#DDBA8B] bg-[#FFF8EC] px-2.5 py-1 text-[#8A633C]">{selectedSetupCount} setup</span> : null}
          {selectedPlanningCount ? <span className="rounded-full border border-black/[0.07] bg-[#F5F2EE] px-2.5 py-1 text-[#817B73]">{selectedPlanningCount} planning</span> : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {["All", ...groups].map((group) => {
          const active = activeGroup === group;
          const count = group === "All" ? CAMPAIGN_CHANNELS.length : CAMPAIGN_CHANNELS.filter((channel) => channel.group === group).length;
          return (
            <button key={group} type="button" onClick={() => setActiveGroup(group)} className={`rounded-full border px-3 py-1.5 text-[10px] font-medium transition ${active ? "border-[#C99A62] bg-[#FBF3E8] text-[#6B4C2E]" : "border-black/[0.07] bg-white text-[#777169] hover:border-[#C9AD89]"}`}>
              {group} <span className="ml-1 text-[9px] opacity-60">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 space-y-5">
        {visibleGroups.map((group) => (
          <div key={group}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A37849]">{group}</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPAIGN_CHANNELS.filter((channel) => channel.group === group).map((channel) => {
                const active = selected.includes(channel.id);
                const state = stateFor(channel);
                const ChannelIcon = channel.icon || Megaphone;
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => {
                      onToggle(channel.id);
                      if (!active) setActiveSettingsChannelId(channel.id);
                    }}
                    className={`flex min-h-[74px] items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${active ? "border-[#C99A62] bg-[#FBF3E8] shadow-[0_8px_30px_rgba(163,120,73,0.08)]" : "border-black/[0.07] bg-white hover:border-[#C9AD89]"}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/[0.06] bg-white p-2">
                      {channel.logo ? <Image src={channel.logo} alt="" width={28} height={28} className="h-full w-full object-contain" /> : <ChannelIcon className="h-5 w-5 text-[#A37849]" />}
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

          </div>
        ))}
      </div>
      {activeSettingsChannel ? (
        <div className="mt-6 rounded-[26px] border border-[#DCC8AE] bg-white p-4 lg:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] pb-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A37849]">Configure Selected Channel</div>
              <div className="mt-1 text-xs text-[#817B73]">Only one channel editor is open at a time. Your other selected channels stay selected.</div>
            </div>
            <div className="text-[10px] text-[#9B9289]">{organizationId ? "Settings for this business" : "Channel settings"}</div>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {selectedChannels.map((channel) => {
              const active = channel.id === activeSettingsChannel.id;
              const state = stateFor(channel);
              return (
                <button key={channel.id} type="button" onClick={() => setActiveSettingsChannelId(channel.id)} className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-medium transition ${active ? "border-[#C99A62] bg-[#FBF3E8] text-[#6B4C2E]" : "border-black/[0.07] bg-[#FCFBF8] text-[#6F675F]"}`}>
                  {channel.logo ? <Image src={channel.logo} alt="" width={18} height={18} className="h-4 w-4 object-contain" /> : (() => { const Icon = channel.icon || Megaphone; return <Icon className="h-4 w-4 text-[#A37849]" />; })()}
                  <span>{channel.name}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${state.ready ? "bg-emerald-600" : state.label === "Planned only" ? "bg-[#9B9289]" : "bg-[#D6A66A]"}`} />
                </button>
              );
            })}
          </div>
          <div className="mt-3">
            <ChannelReadinessNotice
              channel={activeSettingsChannel}
              state={stateFor(activeSettingsChannel)}
              organizationId={organizationId}
            />
            <ChannelSettings
              key={`${activeSettingsChannel.id}-settings`}
              channel={activeSettingsChannel}
              catalog={readyById.get(pickerChannelTarget(activeSettingsChannel.id).catalogId) || null}
              state={stateFor(activeSettingsChannel)}
              organizationId={organizationId}
              assets={assetsForSurface(activeSettingsChannel, readiness?.channel_assets || [])}
              creativeAssets={readiness?.creative_assets || []}
              walletCurrency={readiness?.wallet?.currency || null}
              organizationTimezone={readiness?.time_context?.timezone || null}
              value={{ ...(settings[activeSettingsChannel.id] || {}), ...(organizationSettings[activeSettingsChannel.id] || {}) }}
              onChange={(key, value) => {
                if (multiOrganization && organizationSpecificSetting(key)) {
                  onOrganizationSettingChange(activeSettingsChannel.id, key, value);
                } else {
                  onSettingChange(activeSettingsChannel.id, key, value);
                }
              }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-[#D8C2A8] bg-[#FCFBF8] px-5 py-6 text-center text-xs text-[#817B73]">Choose one or more channels above to configure them.</div>
      )}
      <a href={`/workspace/${organizationId}/administration/communications-setup?onboarding=1`} className="mt-4 inline-flex text-[10px] font-semibold text-[#8A633C] hover:underline">Manage channel connections →</a>
    </div>
  );
}

function ChannelReadinessNotice({ channel, state, organizationId }) {
  const blockers = [...new Set(state?.blockers || [])].filter(Boolean);
  if (state?.ready) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-700/15 bg-emerald-50 px-4 py-3">
        <div><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Ready for governed preflight</div><div className="mt-1 text-xs text-emerald-800">{channel?.name} is connected and its current execution route is available for this organization.</div></div>
        <Check className="h-4 w-4 text-emerald-700" />
      </div>
    );
  }
  if (state?.label === "Planned only") {
    return (
      <div className="mb-4 rounded-2xl border border-black/[0.07] bg-[#F7F6F3] px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7B7168]">Strategy planning only</div>
        <div className="mt-1 text-xs leading-relaxed text-[#6F675F]">{state?.detail || `${channel?.name || "This channel"} does not have an active campaign execution adapter yet.`}</div>
        {blockers.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-[10px] leading-relaxed text-[#817B73]">{blockers.slice(0, 4).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A5A36]">Setup required before execution</div>
          <div className="mt-1 text-xs leading-relaxed text-[#7A5A36]">{state?.detail || `${channel?.name || "This channel"} needs additional organization setup.`}</div>
          {blockers.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-[10px] leading-relaxed text-[#7A5A36]">{blockers.slice(0, 4).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}
        </div>
        <a href={`/workspace/${organizationId}/administration/communications-setup?onboarding=1`} className="shrink-0 rounded-full border border-[#D8B78D] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#7A5735] hover:bg-[#FBF4EA]">Open setup</a>
      </div>
    </div>
  );
}

function ChannelSettings({ channel, catalog, state, organizationId, assets = [], creativeAssets = [], walletCurrency = null, organizationTimezone = null, value, onChange }) {
  const fields = {
    social: [
      ["accountAssetId", "Publishing account", "Connected account"],
      ["message", "Channel message", "Optional override; otherwise the campaign core message is used"],
      ["format", "Format", "Post, Reel, Story, Carousel, Short"],
      ["postingTime", "Posting time", "Automatic or scheduled time"],
      ["destinationUrl", "Destination URL", "Optional landing page"],
      ["callToAction", "Call to action", "Book, Learn more, Shop, Message…"],
      ["hashtags", "Hashtags / topics", "Optional channel-specific topics"],
    ],
    video: [
      ["accountAssetId", "Publishing account", "Connected channel"],
      ["format", "Format", "Short, Video, Live"],
      ["visibility", "Visibility", "Public / unlisted / scheduled"],
      ["playlist", "Playlist", "Optional playlist"],
      ["title", "Video title", "Channel-specific title"],
      ["description", "Description", "Channel-specific description"],
      ["destinationUrl", "Destination URL", "Optional landing page"],
    ],
    messaging: [
      ["senderAssetId", "Sending account", "Connected sender / account"],
      ["audience", "Audience", "Customer segment / list"],
      ["template", "Template", "Approved template or freeform"],
      ["sendWindow", "Send window", "Business hours / scheduled"],
      ["messageVariant", "Message variant", "Campaign-specific message"],
      ["destinationUrl", "Destination URL", "Booking / product / website"],
      ["frequencyCap", "Frequency cap", "Maximum sends per contact"],
    ],
    email: [
      ["senderAssetId", "From mailbox", "Connected sender"],
      ["subject", "Subject", "Campaign subject"],
      ["previewText", "Preview text", "Inbox preview line"],
      ["template", "Template", "Newsletter / promotion / custom"],
      ["audience", "Recipient segment", "Customer segment / list"],
      ["sendWindow", "Send window", "Automatic / scheduled"],
      ["replyTo", "Reply-to", "Connected reply mailbox"],
      ["destinationUrl", "Primary destination", "Website / booking / product"],
    ],
    push: [
      ["audience", "Audience", "App / web segment"],
      ["title", "Title", "Notification title"],
      ["message", "Message", "Notification body"],
      ["deepLink", "Destination", "Deep link / URL"],
      ["schedule", "Schedule", "Immediate / scheduled"],
      ["frequencyCap", "Frequency cap", "Maximum sends per user"],
    ],
    local: [
      ["locationAssetId", "Business location", "Connected location"],
      ["postType", "Post type", "Update / offer / event"],
      ["cta", "CTA", "Call / website / directions / booking"],
      ["destinationUrl", "Destination URL", "Optional landing page"],
      ["offerStart", "Offer / event start", "Optional start date"],
      ["offerEnd", "Offer / event end", "Optional end date"],
    ],
    meta_ads: [
      ["destination", "Destination", "Engagement / Website / WhatsApp"],
      ["networks", "Delivery", "Facebook / Instagram"],
      ["optimization", "Optimization", "Engagement / clicks / conversations"],
      ["placements", "Placements", "Automatic / manual"],
      ["ageRange", "Age range", "Example: 25-55"],
      ["locations", "Locations", "Country / city / radius"],
      ["interests", "Interests", "Resolved Meta interests"],
      ["customAudiences", "Custom audiences", "Connected audience IDs / names"],
      ["retargeting", "Retargeting", "Website / engagement / customer list"],
      ["bidStrategy", "Bid strategy", "Lowest cost / cap strategy"],
      ["dailyBudget", "Daily budget", "Optional daily allocation"],
      ["landingPage", "Landing page", "Required for website campaigns"],
      ["conversionEvent", "Conversion event", "Optional tracked conversion"],
      ["tracking", "Tracking / UTM", "Campaign tracking parameters"],
    ],
    google_ads: [
      ["accountAssetId", "Google Ads account", "Connected advertiser account"],
      ["keywords", "Keywords", "Comma separated"],
      ["negativeKeywords", "Negative keywords", "Comma separated"],
      ["headlines", "Headlines", "At least 3"],
      ["descriptions", "Descriptions", "At least 2"],
      ["landingPage", "Landing page", "https://..."],
      ["locations", "Locations", "Country / region / city"],
      ["languages", "Languages", "Target languages"],
      ["dailyBudget", "Daily budget", "Optional daily allocation"],
      ["bidStrategy", "Bid strategy", "Clicks / conversions / value"],
      ["conversionEvent", "Conversion goal", "Connected conversion action"],
      ["tracking", "Tracking / UTM", "Campaign tracking parameters"],
    ],
    paid: [
      ["accountAssetId", "Ad account", "Connected account"],
      ["objective", "Objective", "Traffic / leads / sales / awareness"],
      ["destination", "Destination", "Website / app / message"],
      ["audience", "Audience", "Target segment / targeting rules"],
      ["locations", "Locations", "Country / region / city / radius"],
      ["formats", "Creative formats", "Image / video / carousel…"],
      ["placements", "Placements", "Automatic / manual"],
      ["optimization", "Optimization", "Provider-specific optimization"],
      ["dailyBudget", "Daily budget", "Optional daily allocation"],
      ["bidStrategy", "Bid strategy", "Provider-supported strategy"],
      ["conversionEvent", "Conversion event", "Optional tracked conversion"],
      ["landingPage", "Landing page", "Destination URL"],
      ["tracking", "Tracking / UTM", "Campaign tracking parameters"],
    ],
    commerce: [
      ["marketplaces", "Marketplaces", "Shopify, Shopee, Lazada, Amazon…"],
      ["catalog", "Catalog", "Product catalog / collection"],
      ["products", "Products", "Products / collection / service"],
      ["destination", "Destination", "Product / purchase / booking"],
      ["offer", "Offer", "Price / promotion / voucher"],
      ["tracking", "Attribution", "Platform / UTM / promo code"],
    ],
    offline: [
      ["type", "Activation", "Influencer, event, PR, QR, print, radio, outdoor…"],
      ["owner", "Owner / partner", "Responsible person or partner"],
      ["location", "Location / market", "Where the activation runs"],
      ["deliverable", "Deliverable", "Post, event, placement, print run…"],
      ["schedule", "Schedule", "Date / period / recurrence"],
      ["budget", "Budget", "Optional activation budget"],
      ["tracking", "Tracking", "QR / code / attribution method"],
    ],
  }[channel.settings] || [];
  if (!fields.length) return null;
  const supported = [
    ["Networks", catalog?.networks],
    ["Destinations", catalog?.destinations],
    ["Formats", catalog?.formats],
  ].filter(([, items]) => Array.isArray(items) && items.length);

  if (channel.settings === "meta_ads") {
    return <MetaAdsSettings channel={channel} catalog={catalog} state={state} organizationId={organizationId} assets={assets} creativeAssets={creativeAssets} value={value} onChange={onChange} />;
  }
  if (channel.settings === "google_ads") {
    return <GoogleAdsSettings channel={channel} state={state} organizationId={organizationId} assets={assets} walletCurrency={walletCurrency} organizationTimezone={organizationTimezone} value={value} onChange={onChange} />;
  }
  if (channel.id === "tiktok") {
    return <TikTokCampaignSettings state={state} organizationId={organizationId} assets={assets} creativeAssets={creativeAssets} value={value} onChange={onChange} />;
  }
  if (channel.id === "youtube") {
    return <YouTubeCampaignSettings state={state} organizationId={organizationId} assets={assets} creativeAssets={creativeAssets} value={value} onChange={onChange} />;
  }
  if (channel.id === "pinterest") {
    return <PinterestCampaignSettings state={state} organizationId={organizationId} assets={assets} creativeAssets={creativeAssets} value={value} onChange={onChange} />;
  }
  if (channel.settings === "social" && ["facebook", "instagram", "linkedin", "threads", "x"].includes(channel.id)) {
    return <OrganicSocialSettings channel={channel} state={state} organizationId={organizationId} assets={assets} creativeAssets={creativeAssets} value={value} onChange={onChange} />;
  }
  if (channel.id === "google_business") {
    return <GoogleBusinessSettings state={state} organizationId={organizationId} assets={assets} creativeAssets={creativeAssets} value={value} onChange={onChange} />;
  }
  if (["email", "whatsapp", "line", "telegram", "sms"].includes(channel.id)) {
    return <OwnedMessagingCampaignSettings channel={channel} state={state} organizationId={organizationId} assets={assets} value={value} onChange={onChange} />;
  }
  if (channel.settings === "paid") {
    return <PlanningPaidChannelSettings channel={channel} catalog={catalog} state={state} value={value} onChange={onChange} />;
  }

  return (
    <div className="rounded-2xl border border-[#D8C2A8] bg-[#FFFDF9] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold text-[#4A4138]">{channel.name} settings</div>
          <div className={`mt-1 text-[9px] font-medium ${state?.ready ? "text-emerald-700" : state?.label === "Planned only" ? "text-[#8A8178]" : "text-[#A37849]"}`}>
            {state?.label || "Setup"}{state?.detail ? ` · ${state.detail}` : ""}
          </div>
        </div>
        <div className="text-[9px] uppercase tracking-[0.14em] text-[#A37849]">{state?.label === "Planned only" ? "Strategy blueprint" : "Per channel"}</div>
      </div>
      {!state?.ready && state?.label !== "Planned only" ? (
        <a href={`/workspace/${organizationId}/administration/communications-setup?onboarding=1`} className="mt-3 inline-flex rounded-full border border-[#D8B78D] bg-[#FBF4EA] px-3 py-1.5 text-[10px] font-semibold text-[#7A5735] hover:bg-[#F4E7D5]">
          Open Channel Setup
        </a>
      ) : null}
      {state?.label === "Planned only" ? (
        <div className="mt-3 rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] px-4 py-3 text-xs leading-relaxed text-[#7A5A36]">
          Strategy blueprint only. These fields are saved with the campaign for future provider implementation; Avantiqo will not publish, send, reserve spend or call a provider from this channel configuration.
        </div>
      ) : null}
      {supported.length ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {supported.map(([label, items]) => (
            <div key={label} className="rounded-xl border border-black/[0.06] bg-white px-3 py-2">
              <div className="text-[8px] uppercase tracking-[0.12em] text-[#9B9289]">{label}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-[#625B53]">{items.map((item) => String(item).replaceAll("_", " ")).join(" · ")}</div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {fields.map(([key,label,placeholder]) => {
          const assetField = key.endsWith("AssetId");
          return (
            <label key={key} className="block">
              <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">{label}</span>
              {assetField ? (
                <select value={value[key] || ""} onChange={(event) => onChange(key, event.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none focus:border-[#D6A66A]/50">
                  <option value="">{assets.length ? `Select ${label.toLowerCase()}` : "No connected asset available"}</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>{asset.name}</option>
                  ))}
                </select>
              ) : (
                <input value={value[key] || ""} onChange={(event) => onChange(key, event.target.value)} placeholder={placeholder} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none placeholder:text-[#B3AAA1] focus:border-[#D6A66A]/50" />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function PlanningPaidChannelSettings({ channel, catalog, state, value, onChange }) {
  const runtimeStatus = String(catalog?.catalog_runtime_status || catalog?.runtime_status || "").toUpperCase();
  const destinations = Array.isArray(catalog?.destinations) ? catalog.destinations : [];
  const formats = Array.isArray(catalog?.formats) ? catalog.formats : [];
  const networks = Array.isArray(catalog?.networks) ? catalog.networks : [];
  const selectedFormats = splitList(value.formats);
  const selectedNetworks = splitList(value.networks);
  const toggle = (key, item) => {
    const current = splitList(value[key]);
    onChange(key, (current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item]).join(", "));
  };
  const implementationLabel = runtimeStatus === "IMPLEMENTATION_REQUIRED"
    ? "Provider adapter not implemented"
    : runtimeStatus === "NOT_REGISTERED"
      ? "Provider integration not registered"
      : state?.detail || "Provider execution unavailable";

  return (
    <div className="rounded-[24px] border border-[#D8C2A8] bg-[#FFFDF9] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {channel.logo ? <Image src={channel.logo} alt="" width={22} height={22} className="h-5 w-5 object-contain" /> : (() => { const Icon = channel.icon || Megaphone; return <Icon className="h-5 w-5 text-[#A37849]" />; })()}
            <div className="text-sm font-semibold text-[#3E3730]">{channel.name} · Strategy Blueprint</div>
          </div>
          <div className="mt-1 text-[10px] font-medium text-[#8A8178]">Planning only · {implementationLabel}</div>
        </div>
        <span className="rounded-full border border-black/[0.08] bg-[#F5F2EE] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#817B73]">No provider execution</span>
      </div>

      <div className="mt-4 rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] px-4 py-3 text-xs leading-relaxed text-[#7A5A36]">
        Build the campaign strategy here without implying a live provider connection. Avantiqo will not create an ad account campaign, reserve provider spend, upload creative, or publish on {channel.name} from this blueprint.
      </div>

      <MetaSection title="Strategy">
        <MetaInput label="Campaign objective" value={value.objective || ""} onChange={(next) => onChange("objective", next)} helper="Business objective, not a provider objective ID" />
        <label className="block">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Intended destination</span>
          <select value={value.destination || ""} onChange={(event) => onChange("destination", event.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none focus:border-[#D6A66A]/50">
            <option value="">Select intended destination</option>
            {destinations.map((item) => <option key={item} value={item}>{String(item).replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <div className="md:col-span-2"><MetaInput label="Audience brief" value={value.audience || ""} onChange={(next) => onChange("audience", next)} helper="Who should this provider campaign reach?" /></div>
        <MetaInput label="Markets / locations" value={value.locations || ""} onChange={(next) => onChange("locations", next)} helper="Planning text only until provider targeting is integrated" />
        <MetaInput label="Landing page" value={value.landingPage || ""} onChange={(next) => onChange("landingPage", next)} helper="Intended destination URL" />
      </MetaSection>

      {networks.length ? (
        <MetaSection title="Intended Networks">
          <div className="md:col-span-2"><MetaChoice label="Network plan" options={networks} selected={selectedNetworks} onToggle={(item) => toggle("networks", item)} allowEmpty emptyLabel="Not selected" /></div>
        </MetaSection>
      ) : null}

      {formats.length ? (
        <MetaSection title="Creative Plan">
          <div className="md:col-span-2"><MetaChoice label="Desired formats" options={formats} selected={selectedFormats} onToggle={(item) => toggle("formats", item)} allowEmpty emptyLabel="Not selected" /></div>
          <div className="md:col-span-2"><MetaInput label="Creative direction" value={value.creativeDirection || ""} onChange={(next) => onChange("creativeDirection", next)} helper="Provider-specific concept, not an uploaded provider creative" /></div>
        </MetaSection>
      ) : null}

      <MetaSection title="Planning Budget & Measurement">
        <MetaInput label="Planned provider budget" type="number" value={value.plannedBudget || ""} onChange={(next) => onChange("plannedBudget", next)} helper="Planning amount only; this does not authorize or reserve spend" />
        <MetaInput label="Success metric" value={value.successMetric || ""} onChange={(next) => onChange("successMetric", next)} helper="CPA, ROAS, leads, reach, video views…" />
        <div className="md:col-span-2"><MetaInput label="Provider notes" value={value.providerNotes || ""} onChange={(next) => onChange("providerNotes", next)} helper="Requirements to carry forward when this provider adapter is implemented" /></div>
      </MetaSection>
    </div>
  );
}

function OwnedMessagingCampaignSettings({ channel, state, organizationId, assets = [], value, onChange }) {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const selectedIds = Array.isArray(value.recipientPartyIds) ? value.recipientPartyIds : [];
  const isEmail = channel.id === "email";
  const isWhatsApp = channel.id === "whatsapp";
  const isSms = channel.id === "sms";
  const smsInfo = isSms ? analyzeSmsSegments(value.messageVariant || value.message || "") : null;

  async function searchCustomers() {
    setSearching(true);
    setError("");
    try {
      const response = await fetch(`/api/commercial/customers?organizationId=${encodeURIComponent(organizationId)}&query=${encodeURIComponent(query.trim())}&limit=30`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) throw new Error(payload?.error || "Unable to search customers");
      setCustomers(payload?.customers || payload?.rows || []);
    } catch (searchError) {
      setCustomers([]);
      setError(searchError.message || "Unable to search customers");
    } finally {
      setSearching(false);
    }
  }

  function toggleRecipient(customer) {
    const id = String(customer.party_id || customer.id || "");
    if (!id) return;
    const next = selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id];
    onChange("recipientPartyIds", next);
    setPreview(null);
  }

  async function previewEligibility() {
    setPreviewing(true);
    setError("");
    try {
      const params = new URLSearchParams({ organizationId, channel: channel.id });
      if (selectedIds.length) params.set("partyIds", selectedIds.join(","));
      const response = await fetch(`/api/marketing/channel-consent?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) throw new Error(payload?.error || "Unable to preview campaign recipients");
      setPreview(payload?.data || null);
    } catch (previewError) {
      setPreview(null);
      setError(previewError.message || "Unable to preview campaign recipients");
    } finally {
      setPreviewing(false);
    }
  }

  async function loadWhatsAppTemplates() {
    setLoadingTemplates(true);
    setError("");
    try {
      const response = await fetch(`/api/marketing/whatsapp-templates?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) throw new Error(payload?.error || "Unable to load approved WhatsApp templates");
      setTemplates(payload?.data?.results || []);
    } catch (templateError) {
      setTemplates([]);
      setError(templateError.message || "Unable to load approved WhatsApp templates");
    } finally {
      setLoadingTemplates(false);
    }
  }

  function selectWhatsAppTemplate(template) {
    const parameterCount = Number(template?.body_parameter_count || 0);
    onChange("templateId", template?.id || "");
    onChange("templateName", template?.name || "");
    onChange("templateLanguage", template?.language || "");
    onChange("templateUnsupportedVariables", template?.unsupported_variable_structure === true);
    onChange("templateParameterCount", parameterCount);
    onChange("templateComponents", parameterCount
      ? [{ type: "body", parameters: Array.from({ length: parameterCount }, () => ({ type: "text", text: "" })) }]
      : []);
  }

  function setWhatsAppTemplateParameter(index, nextValue) {
    const count = Number(value.templateParameterCount || 0);
    const current = Array.isArray(value.templateComponents?.[0]?.parameters)
      ? value.templateComponents[0].parameters
      : [];
    const parameters = Array.from({ length: count }, (_, itemIndex) => ({
      type: "text",
      text: itemIndex === index ? nextValue : String(current[itemIndex]?.text || ""),
    }));
    onChange("templateComponents", [{ type: "body", parameters }]);
  }

  return (
    <div className="rounded-[24px] border border-[#D8C2A8] bg-[#FFFDF9] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#3E3730]">{channel.name} · Campaign Planning</div>
          <div className="mt-1 text-[10px] font-medium text-[#8A8178]">{state?.label || "Planned only"}{state?.detail ? ` · ${state.detail}` : ""}</div>
        </div>
        <a href={`/workspace/${organizationId}/administration/communications-setup?onboarding=1`} className="rounded-full border border-[#D8B78D] bg-[#FBF4EA] px-3 py-1.5 text-[10px] font-semibold text-[#7A5735]">Channel Setup</a>
      </div>

      {state?.blockers?.length ? (
        <div className="mt-4 rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A5A36]">Activation blockers</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[10px] leading-relaxed text-[#7A5A36]">
            {[...new Set(state.blockers)].map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        </div>
      ) : null}

      <MetaSection title="Sender">
        <label className="block md:col-span-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">{isEmail ? "From mailbox" : "Sending account"}</span>
          <select value={value.senderAssetId || ""} onChange={(event) => onChange("senderAssetId", event.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none">
            <option value="">{assets.length ? "Select connected sender" : "No connected sender available"}</option>
            {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </label>
        {isEmail ? <MetaInput label="Subject" value={value.subject || ""} onChange={(next) => onChange("subject", next)} /> : null}
        {isEmail ? <MetaInput label="Preview text" value={value.previewText || ""} onChange={(next) => onChange("previewText", next)} /> : null}
        <div className="md:col-span-2"><MetaInput label="Campaign message" value={value.messageVariant || value.message || ""} onChange={(next) => onChange("messageVariant", next)} /></div>
        {isSms ? (
          <div className="md:col-span-2 grid gap-2 sm:grid-cols-3">
            <MiniState label="Encoding" value={smsInfo.encoding} />
            <MiniState label="Characters" value={String(smsInfo.characters)} />
            <MiniState label="Estimated segments" value={String(smsInfo.segments)} />
            <div className="sm:col-span-3 rounded-xl border border-[#DDBA8B] bg-[#FFF8EC] px-3 py-2 text-[10px] leading-relaxed text-[#7A5A36]">Twilio may charge per SMS segment. GSM-7 multipart messages use 153 units per segment; UCS-2 uses 67. Unicode or emoji can change the encoding and segment count.</div>
          </div>
        ) : null}
        <MetaInput label="Destination URL" value={value.destinationUrl || ""} onChange={(next) => onChange("destinationUrl", next)} />
        <MetaInput label="Frequency cap" type="number" value={value.frequencyCap || "1"} onChange={(next) => onChange("frequencyCap", next)} helper="Planned maximum sends per recipient" />
      </MetaSection>

      {isWhatsApp ? (
        <MetaSection title="Approved WhatsApp Template">
          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-[#FCFBF8] p-4">
            <div><div className="text-xs font-medium text-[#4A4138]">Provider-approved template required</div><div className="mt-1 text-[10px] text-[#8A8178]">Campaign broadcasts never fall back to freeform WhatsApp text.</div></div>
            <button type="button" onClick={loadWhatsAppTemplates} disabled={loadingTemplates} className="rounded-xl border border-[#D8B78D] bg-[#FBF4EA] px-3 py-2 text-[10px] font-semibold text-[#7A5735] disabled:opacity-40">{loadingTemplates ? "Loading…" : "Load Approved Templates"}</button>
          </div>
          {templates.length ? (
            <div className="md:col-span-2 max-h-52 overflow-auto rounded-xl border border-black/[0.06] bg-white p-1">
              {templates.map((template) => {
                const selected = value.templateId === template.id;
                return <button key={template.id} type="button" onClick={() => selectWhatsAppTemplate(template)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[10px] ${selected ? "bg-[#FBF3E8] text-[#6B4C2E]" : "text-[#514A43] hover:bg-[#FBF8F3]"}`}><span className="min-w-0"><span className="block truncate font-medium">{template.name}</span><span className="mt-0.5 block text-[#9B9289]">{template.language} · {template.category || "Template"} · {template.body_parameter_count || 0} body variables</span></span><span className="shrink-0">{selected ? "Selected" : "Use"}</span></button>;
              })}
            </div>
          ) : null}
          {value.templateName ? <MiniState label="Selected template" value={`${value.templateName} · ${value.templateLanguage || "language required"}`} /> : null}
          {value.templateUnsupportedVariables ? <div className="rounded-xl border border-red-700/15 bg-red-50 px-3 py-2 text-[10px] text-red-700">This template uses header/media variables that the first certified campaign adapter will not execute. Choose a body-text template instead.</div> : null}
          {Number(value.templateParameterCount || 0) > 0 ? (
            <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
              {Array.from({ length: Number(value.templateParameterCount || 0) }, (_, index) => <MetaInput key={index} label={`Body variable {{${index + 1}}}`} value={value.templateComponents?.[0]?.parameters?.[index]?.text || ""} onChange={(next) => setWhatsAppTemplateParameter(index, next)} />)}
            </div>
          ) : null}
        </MetaSection>
      ) : null}

      <MetaSection title="Recipients & Consent">
        <div className="md:col-span-2">
          <div className="flex gap-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); searchCustomers(); } }} placeholder="Search customer name, email or phone" className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none focus:border-[#D6A66A]/50" />
            <button type="button" onClick={searchCustomers} disabled={searching} className="rounded-xl border border-[#D8B78D] bg-[#FBF4EA] px-3 py-2 text-[10px] font-semibold text-[#7A5735] disabled:opacity-40">{searching ? "Searching…" : "Search"}</button>
          </div>
          {customers.length ? (
            <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-black/[0.06] bg-white p-1">
              {customers.map((customer) => {
                const id = String(customer.party_id || customer.id || "");
                const selected = selectedIds.includes(id);
                return (
                  <button key={id} type="button" onClick={() => toggleRecipient(customer)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[10px] ${selected ? "bg-[#FBF3E8] text-[#6B4C2E]" : "text-[#514A43] hover:bg-[#FBF8F3]"}`}>
                    <span className="min-w-0"><span className="block truncate font-medium">{customer.display_name || customer.customer_name || customer.name || "Customer"}</span><span className="mt-0.5 block truncate text-[#9B9289]">{customer.email || customer.customer_email || customer.phone || customer.customer_phone || "No direct contact address"}</span></span>
                    <span className="shrink-0">{selected ? "Selected" : "Add"}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-[#FCFBF8] p-4">
          <div><div className="text-xs font-medium text-[#4A4138]">{selectedIds.length ? `${selectedIds.length} selected recipient${selectedIds.length === 1 ? "" : "s"}` : "All consented customers preview"}</div><div className="mt-1 text-[10px] text-[#8A8178]">Preview never sends. Only explicit channel consent can become eligible.</div></div>
          <button type="button" onClick={previewEligibility} disabled={previewing} className="rounded-xl border border-[#D8B78D] bg-[#FBF4EA] px-3 py-2 text-[10px] font-semibold text-[#7A5735] disabled:opacity-40">{previewing ? "Checking…" : "Preview Eligibility"}</button>
        </div>
        {error ? <div className="md:col-span-2 rounded-xl border border-red-700/15 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div> : null}
        {preview ? (
          <div className="md:col-span-2 grid gap-2 sm:grid-cols-2">
            <MiniState label="Eligible" value={String(preview.eligible?.length || 0)} />
            <MiniState label="Blocked" value={String(preview.blocked?.length || 0)} />
            {preview.blocked?.length ? <div className="sm:col-span-2 rounded-xl border border-[#DDBA8B] bg-[#FFF8EC] p-3 text-[10px] leading-relaxed text-[#7A5A36]">{Object.entries(preview.blocked.reduce((acc, row) => ({ ...acc, [row.state]: (acc[row.state] || 0) + 1 }), {})).map(([reason, count]) => `${reason.replaceAll("_", " ")}: ${count}`).join(" · ")}</div> : null}
          </div>
        ) : null}
      </MetaSection>

      <div className="mt-4 rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] p-4 text-xs leading-relaxed text-[#7A5A36]">
        Campaign broadcast remains disabled until the channel-specific consent/suppression migration is deployed and a certified campaign adapter is enabled. Operational one-to-one messaging is separate.
      </div>
    </div>
  );
}

function YouTubeCampaignSettings({ state, organizationId, assets = [], creativeAssets = [], value, onChange }) {
  const approvedVideos = creativeAssets.filter((asset) => asset.approval_status === "APPROVED" && String(asset.media_kind || "").toUpperCase() === "VIDEO");
  return (
    <div className="rounded-[24px] border border-[#D8C2A8] bg-[#FFFDF9] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="text-sm font-semibold text-[#3E3730]">YouTube · Video Upload</div><div className={`mt-1 text-[10px] font-medium ${state?.ready ? "text-emerald-700" : "text-[#A37849]"}`}>{state?.label || "Setup"}{state?.detail ? ` · ${state.detail}` : ""}</div></div>
        {!state?.ready ? <a href={`/workspace/${organizationId}/administration/communications-setup?onboarding=1`} className="rounded-full border border-[#D8B78D] bg-[#FBF4EA] px-3 py-1.5 text-[10px] font-semibold text-[#7A5735]">Open YouTube Setup</a> : null}
      </div>
      <MetaSection title="Channel & Video">
        <label className="block md:col-span-2"><span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">YouTube channel</span><select value={value.accountAssetId || ""} onChange={(e) => onChange("accountAssetId", e.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs"><option value="">{assets.length ? "Select YouTube channel" : "No connected YouTube channel"}</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
        <label className="block md:col-span-2"><span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Approved video · required</span><select value={value.creativeAssetId || ""} onChange={(e) => onChange("creativeAssetId", e.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs"><option value="">Select approved video</option>{approvedVideos.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
        <div className="md:col-span-2"><MetaInput label="Video title" value={value.title || ""} onChange={(v) => onChange("title", v)} helper={`${String(value.title || "").length}/100 characters`} /></div>
        <div className="md:col-span-2"><label className="block"><span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Description</span><textarea rows={5} value={value.description || ""} onChange={(e) => onChange("description", e.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs" /><span className="mt-1 block text-right text-[10px] text-[#9B9289]">{String(value.description || "").length.toLocaleString()}/5,000</span></label></div>
        <MetaSelect label="Privacy" value={value.privacyStatus || "private"} onChange={(v) => onChange("privacyStatus", v)} options={[["private","Private"],["unlisted","Unlisted"],["public","Public"]]} />
        <MetaInput label="Category ID" value={value.categoryId || "22"} onChange={(v) => onChange("categoryId", v.replace(/\D/g, ""))} helper="YouTube category; 22 = People & Blogs" />
        <div className="md:col-span-2"><MetaInput label="Tags" value={Array.isArray(value.tags) ? value.tags.join(", ") : value.tags || ""} onChange={(v) => onChange("tags", splitList(v))} helper="Comma separated" /></div>
        <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-black/[0.07] bg-[#FCFBF8] px-4 py-3 text-xs text-[#625B53]"><input type="checkbox" checked={value.madeForKids === true} onChange={(e) => onChange("madeForKids", e.target.checked)} /> This video is made for kids</label>
      </MetaSection>
      <div className="mt-4 rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] p-4 text-xs leading-relaxed text-[#7A5A36]">YouTube execution uploads the exact approved video after owner approval. Provider upload limit in the current adapter is 512 MB. Preflight does not upload.</div>
    </div>
  );
}

function PinterestCampaignSettings({ state, organizationId, assets = [], creativeAssets = [], value, onChange }) {
  const [boards, setBoards] = useState([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [error, setError] = useState("");
  const approvedImages = creativeAssets.filter((asset) => asset.approval_status === "APPROVED" && String(asset.media_kind || "").toUpperCase() === "IMAGE");
  async function loadBoards() {
    if (!value.accountAssetId) { setError("Select the Pinterest account first."); return; }
    setLoadingBoards(true); setError("");
    try {
      const response = await fetch(`/api/marketing/pinterest-boards?organizationId=${encodeURIComponent(organizationId)}&accountAssetId=${encodeURIComponent(value.accountAssetId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) throw new Error(payload?.error || "Unable to load Pinterest boards");
      setBoards(payload?.data?.boards || []);
    } catch (loadError) { setBoards([]); setError(loadError.message || "Unable to load Pinterest boards"); }
    finally { setLoadingBoards(false); }
  }
  return (
    <div className="rounded-[24px] border border-[#D8C2A8] bg-[#FFFDF9] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-[#3E3730]">Pinterest · Image Pin</div><div className={`mt-1 text-[10px] font-medium ${state?.ready ? "text-emerald-700" : "text-[#A37849]"}`}>{state?.label || "Setup"}{state?.detail ? ` · ${state.detail}` : ""}</div></div>{!state?.ready ? <a href={`/workspace/${organizationId}/administration/communications-setup?onboarding=1`} className="rounded-full border border-[#D8B78D] bg-[#FBF4EA] px-3 py-1.5 text-[10px] font-semibold text-[#7A5735]">Open Pinterest Setup</a> : null}</div>
      <MetaSection title="Account & Board">
        <label className="block md:col-span-2"><span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Pinterest account</span><div className="mt-1.5 flex gap-2"><select value={value.accountAssetId || ""} onChange={(e) => { onChange("accountAssetId", e.target.value); onChange("boardId", ""); onChange("boardName", ""); setBoards([]); }} className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs"><option value="">{assets.length ? "Select Pinterest account" : "No connected Pinterest account"}</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><button type="button" onClick={loadBoards} disabled={loadingBoards || !value.accountAssetId} className="rounded-xl border border-[#D8B78D] bg-[#FBF4EA] px-3 py-2 text-[10px] font-semibold text-[#7A5735] disabled:opacity-40">{loadingBoards ? "Loading…" : "Load Boards"}</button></div></label>
        {error ? <div className="md:col-span-2 rounded-xl border border-red-700/15 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div> : null}
        <label className="block md:col-span-2"><span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Board</span><select value={value.boardId || ""} onChange={(e) => { const board=boards.find((row)=>row.id===e.target.value); onChange("boardId", e.target.value); onChange("boardName", board?.name || ""); }} disabled={!boards.length} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs disabled:bg-[#F3F0EC]"><option value="">{boards.length ? "Select board" : value.boardId ? value.boardName || "Selected board" : "Load boards first"}</option>{boards.map((board) => <option key={board.id} value={board.id}>{board.name}{board.privacy ? ` · ${board.privacy}` : ""}</option>)}</select></label>
      </MetaSection>
      <MetaSection title="Pin">
        <label className="block md:col-span-2"><span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Approved image · required</span><select value={value.creativeAssetId || ""} onChange={(e) => onChange("creativeAssetId", e.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs"><option value="">Select approved image</option>{approvedImages.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
        <MetaInput label="Pin title" value={value.title || ""} onChange={(v) => onChange("title", v)} helper={`${String(value.title || "").length}/100`} />
        <MetaInput label="Destination link" value={value.destinationUrl || ""} onChange={(v) => onChange("destinationUrl", v)} helper="Optional public HTTPS URL" />
        <div className="md:col-span-2"><label className="block"><span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Description</span><textarea rows={5} value={value.description || ""} onChange={(e) => onChange("description", e.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs" /><span className="mt-1 block text-right text-[10px] text-[#9B9289]">{String(value.description || "").length}/800</span></label></div>
      </MetaSection>
      <div className="mt-4 rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] p-4 text-xs leading-relaxed text-[#7A5A36]">Pinterest execution creates one image Pin on the exact selected board after owner approval. Preflight does not create the Pin.</div>
    </div>
  );
}

function TikTokCampaignSettings({ state, organizationId, assets = [], creativeAssets = [], value, onChange }) {
  const [creator, setCreator] = useState(null);
  const [creatorAccountId, setCreatorAccountId] = useState("");
  const [loadingCreator, setLoadingCreator] = useState(false);
  const [creatorError, setCreatorError] = useState("");
  const approvedVideos = creativeAssets.filter((asset) => asset.approval_status === "APPROVED" && String(asset.media_kind || "").toUpperCase() === "VIDEO");
  const creatorCurrent = creatorAccountId && creatorAccountId === value.accountAssetId ? creator : null;
  const privacyOptions = Array.isArray(creatorCurrent?.privacy_level_options) ? creatorCurrent.privacy_level_options : [];

  async function loadCreator() {
    if (!value.accountAssetId) {
      setCreatorError("Select the TikTok account first.");
      return;
    }
    setLoadingCreator(true);
    setCreatorError("");
    try {
      const response = await fetch(`/api/marketing/tiktok-creator?organizationId=${encodeURIComponent(organizationId)}&accountAssetId=${encodeURIComponent(value.accountAssetId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) throw new Error(payload?.error || "Unable to load TikTok creator options");
      const nextCreator = payload?.data?.creator || {};
      setCreator(nextCreator);
      setCreatorAccountId(value.accountAssetId);
      if (value.privacyLevel && !nextCreator.privacy_level_options?.includes(value.privacyLevel)) onChange("privacyLevel", "");
    } catch (error) {
      setCreator(null);
      setCreatorAccountId("");
      setCreatorError(error.message || "Unable to load TikTok creator options");
    } finally {
      setLoadingCreator(false);
    }
  }

  return (
    <div className="rounded-[24px] border border-[#D8C2A8] bg-[#FFFDF9] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#3E3730]">TikTok · Direct Video Post</div>
          <div className={`mt-1 text-[10px] font-medium ${state?.ready ? "text-emerald-700" : "text-[#A37849]"}`}>{state?.label || "Setup"}{state?.detail ? ` · ${state.detail}` : ""}</div>
        </div>
        {!state?.ready ? <a href={`/workspace/${organizationId}/administration/communications-setup?onboarding=1`} className="rounded-full border border-[#D8B78D] bg-[#FBF4EA] px-3 py-1.5 text-[10px] font-semibold text-[#7A5735]">Open TikTok Setup</a> : null}
      </div>

      <MetaSection title="Creator Account">
        <label className="block md:col-span-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Organization TikTok account</span>
          <div className="mt-1.5 flex gap-2">
            <select value={value.accountAssetId || ""} onChange={(event) => { onChange("accountAssetId", event.target.value); onChange("privacyLevel", ""); setCreator(null); setCreatorAccountId(""); }} className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none">
              <option value="">{assets.length ? "Select TikTok account" : "No connected TikTok account"}</option>
              {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
            </select>
            <button type="button" onClick={loadCreator} disabled={loadingCreator || !value.accountAssetId} className="rounded-xl border border-[#D8B78D] bg-[#FBF4EA] px-3 py-2 text-[10px] font-semibold text-[#7A5735] disabled:opacity-40">{loadingCreator ? "Loading…" : "Load Creator Options"}</button>
          </div>
        </label>
        {creatorError ? <div className="md:col-span-2 rounded-xl border border-red-700/15 bg-red-50 px-3 py-2 text-[10px] text-red-700">{creatorError}</div> : null}
        {creatorCurrent ? (
          <div className="md:col-span-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MiniState label="Creator" value={creatorCurrent.creator_nickname || creatorCurrent.creator_username || "Connected"} />
            <MiniState label="Comments" value={creatorCurrent.comment_disabled ? "Provider disabled" : "Available"} />
            <MiniState label="Duet / Stitch" value={creatorCurrent.duet_disabled && creatorCurrent.stitch_disabled ? "Provider disabled" : "Available"} />
            <MiniState label="Max video" value={creatorCurrent.max_video_post_duration_sec ? `${creatorCurrent.max_video_post_duration_sec}s` : "Provider default"} />
          </div>
        ) : null}
      </MetaSection>

      <MetaSection title="Privacy & Consent">
        <label className="block md:col-span-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Privacy level · live creator options</span>
          <select value={value.privacyLevel || ""} onChange={(event) => onChange("privacyLevel", event.target.value)} disabled={!creatorCurrent} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none disabled:bg-[#F3F0EC] disabled:text-[#9B9289]">
            <option value="">{creatorCurrent ? "Select current privacy option" : "Load creator options first"}</option>
            {privacyOptions.map((option) => <option key={option} value={option}>{String(option).replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label className="md:col-span-2 flex items-start gap-3 rounded-xl border border-[#DDBA8B] bg-[#FFF8EC] px-4 py-3 text-xs leading-relaxed text-[#6B4C2E]">
          <input type="checkbox" checked={value.creatorConsent === true} onChange={(event) => onChange("creatorConsent", event.target.checked)} className="mt-0.5" />
          <span><strong>Explicit creator consent.</strong> I confirm this TikTok account owner has authorized this exact publication and the selected privacy level.</span>
        </label>
      </MetaSection>

      <MetaSection title="Video & Post">
        <label className="block md:col-span-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Approved organization video</span>
          <select value={value.creativeAssetId || ""} onChange={(event) => onChange("creativeAssetId", event.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none">
            <option value="">{approvedVideos.length ? "Select approved video" : "No approved video available"}</option>
            {approvedVideos.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Caption / title</span>
          <textarea value={value.message || ""} onChange={(event) => onChange("message", event.target.value)} rows={4} placeholder="Optional override; otherwise Campaign Core Message is used" className="mt-1.5 w-full resize-y rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs leading-relaxed text-[#2D2822] outline-none focus:border-[#D6A66A]/50" />
        </label>
        <ToggleField label="Disable comments" checked={value.disableComment === true || creatorCurrent?.comment_disabled === true} disabled={creatorCurrent?.comment_disabled === true} onChange={(checked) => onChange("disableComment", checked)} />
        <ToggleField label="Disable duet" checked={value.disableDuet === true || creatorCurrent?.duet_disabled === true} disabled={creatorCurrent?.duet_disabled === true} onChange={(checked) => onChange("disableDuet", checked)} />
        <ToggleField label="Disable stitch" checked={value.disableStitch === true || creatorCurrent?.stitch_disabled === true} disabled={creatorCurrent?.stitch_disabled === true} onChange={(checked) => onChange("disableStitch", checked)} />
        <ToggleField label="Branded / promotional content" checked={value.brandOrganicToggle === true} onChange={(checked) => onChange("brandOrganicToggle", checked)} />
        <ToggleField label="AI-generated content disclosure" checked={value.isAigc === true} onChange={(checked) => onChange("isAigc", checked)} />
      </MetaSection>

      <div className="mt-4 rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] p-4 text-xs leading-relaxed text-[#7A5A36]">
        Campaigns currently certifies TikTok <strong>video direct-post</strong> only. Photo posts remain Planning Only until Avantiqo has a verified TikTok pull-URL media-source contract. TikTok processing is asynchronous and is tracked by provider job ID after approval.
      </div>
    </div>
  );
}

function ToggleField({ label, checked, onChange, disabled = false }) {
  return <label className={`flex items-center gap-3 rounded-xl border border-black/[0.07] bg-[#FCFBF8] px-4 py-3 text-xs text-[#625B53] ${disabled ? "opacity-60" : ""}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function MiniState({ label, value }) {
  return <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2"><div className="text-[8px] uppercase tracking-[0.12em] text-[#9B9289]">{label}</div><div className="mt-1 text-[10px] text-[#514A43]">{value}</div></div>;
}

function GoogleBusinessSettings({ state, organizationId, assets = [], creativeAssets = [], value, onChange }) {
  const mappedLocations = assets.filter((asset) => Boolean(asset.entity_id));
  const approvedImages = creativeAssets.filter((asset) => asset.approval_status === "APPROVED" && String(asset.media_kind || "").toUpperCase() === "IMAGE");
  return (
    <div className="rounded-[24px] border border-[#D8C2A8] bg-[#FFFDF9] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#3E3730]">Google Business Profile · Standard Post</div>
          <div className={`mt-1 text-[10px] font-medium ${state?.ready ? "text-emerald-700" : "text-[#A37849]"}`}>{state?.label || "Setup"}{state?.detail ? ` · ${state.detail}` : ""}</div>
        </div>
        {!state?.ready ? <a href={`/workspace/${organizationId}/administration/communications-setup?onboarding=1`} className="rounded-full border border-[#D8B78D] bg-[#FBF4EA] px-3 py-1.5 text-[10px] font-semibold text-[#7A5735]">Open Google Business Setup</a> : null}
      </div>

      <MetaSection title="Business Location">
        <label className="block md:col-span-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Mapped Business Profile location</span>
          <select value={value.locationAssetId || ""} onChange={(event) => onChange("locationAssetId", event.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none">
            <option value="">{mappedLocations.length ? "Select mapped location" : "No mapped Google Business location"}</option>
            {mappedLocations.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
          {!mappedLocations.length && assets.length ? <span className="mt-1 block text-[10px] text-[#A37849]">Locations are connected but must be mapped to an Avantiqo legal entity before campaign publishing.</span> : null}
        </label>
      </MetaSection>

      <MetaSection title="Post Content">
        <label className="block md:col-span-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Post message</span>
          <textarea value={value.message || ""} onChange={(event) => onChange("message", event.target.value)} rows={5} placeholder="Optional override; otherwise Campaign Core Message is used" className="mt-1.5 w-full resize-y rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs leading-relaxed text-[#2D2822] outline-none focus:border-[#D6A66A]/50" />
          <span className="mt-1 block text-right text-[10px] text-[#9B9289]">{String(value.message || "").length}/1500</span>
        </label>
        <label className="block md:col-span-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Approved image · optional</span>
          <select value={value.creativeAssetId || ""} onChange={(event) => onChange("creativeAssetId", event.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none">
            <option value="">Text-only post</option>
            {approvedImages.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </label>
        <MetaInput label="Language code" value={value.languageCode || "en"} onChange={(v) => onChange("languageCode", v)} helper="Example: en, th, sv" />
        <MetaSelect label="Call to action" value={value.callToActionType || ""} onChange={(v) => onChange("callToActionType", v)} options={[["","No CTA"],["LEARN_MORE","Learn more"],["BOOK","Book"],["ORDER","Order"],["SHOP","Shop"],["SIGN_UP","Sign up"]]} />
        <div className="md:col-span-2"><MetaInput label="CTA / destination URL" value={value.destinationUrl || ""} onChange={(v) => onChange("destinationUrl", v)} helper="Required when a call to action is selected" /></div>
      </MetaSection>

      <div className="mt-4 rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] p-4 text-xs leading-relaxed text-[#7A5A36]">
        Campaigns currently certifies Google Business <strong>STANDARD</strong> posts only. Event and Offer post types stay hidden until their additional provider fields are fully modeled and tested.
      </div>
    </div>
  );
}

function OrganicSocialSettings({ channel, state, organizationId, assets = [], creativeAssets = [], value, onChange }) {
  const mediaKinds = ["facebook", "instagram", "linkedin"].includes(channel.id) ? new Set(["IMAGE"]) : new Set(["IMAGE", "VIDEO"]);
  const approvedMedia = creativeAssets.filter((asset) => asset.approval_status === "APPROVED" && mediaKinds.has(String(asset.media_kind || "").toUpperCase()));
  const selectedMedia = approvedMedia.find((asset) => asset.id === value.creativeAssetId) || null;
  const message = String(value.message || "");
  const providerLabel = channel.id === "facebook" ? "Facebook" : channel.id === "instagram" ? "Instagram" : channel.id === "linkedin" ? "LinkedIn" : channel.id === "threads" ? "Threads" : "X";
  return (
    <div className="rounded-[24px] border border-[#D8C2A8] bg-[#FFFDF9] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#3E3730]">{providerLabel} Organic</div>
          <div className={`mt-1 text-[10px] font-medium ${state?.ready ? "text-emerald-700" : "text-[#A37849]"}`}>{state?.label || "Setup"}{state?.detail ? ` · ${state.detail}` : ""}</div>
        </div>
        {!state?.ready ? <a href={`/workspace/${organizationId}/administration/communications-setup?onboarding=1`} className="rounded-full border border-[#D8B78D] bg-[#FBF4EA] px-3 py-1.5 text-[10px] font-semibold text-[#7A5735]">Open {providerLabel} Setup</a> : null}
      </div>

      <MetaSection title="Publishing Account">
        <label className="block md:col-span-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Organization account</span>
          <select value={value.accountAssetId || ""} onChange={(e) => onChange("accountAssetId", e.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none">
            <option value="">{assets.length ? `Select ${providerLabel} account` : `No connected ${providerLabel} account`}</option>
            {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </label>
      </MetaSection>

      <MetaSection title="Content">
        <label className="block md:col-span-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Channel message</span>
          <textarea value={message} onChange={(e) => onChange("message", e.target.value)} rows={5} placeholder="Optional override; otherwise the campaign core message is used" className="mt-1.5 w-full resize-y rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs leading-relaxed text-[#2D2822] outline-none focus:border-[#D6A66A]/50" />
          <span className="mt-1 block text-right text-[10px] text-[#9B9289]">{message.length.toLocaleString()} characters</span>
        </label>
        <label className="block md:col-span-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">{["facebook", "instagram"].includes(channel.id) ? "Approved image · required" : "Approved creative · optional"}</span>
          <select value={value.creativeAssetId || ""} onChange={(e) => onChange("creativeAssetId", e.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none">
            <option value="">{["facebook", "instagram"].includes(channel.id) ? "Select required approved image" : "Text-only post"}</option>
            {approvedMedia.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {String(asset.media_kind || "media").toLowerCase()}</option>)}
          </select>
          <span className="mt-1 block text-[10px] text-[#9B9289]">{["facebook", "instagram", "linkedin"].includes(channel.id) ? `${providerLabel} Campaigns currently supports approved image posts.` : channel.id === "threads" ? "Threads Campaigns supports approved image or video posts." : "X Campaigns supports approved image or video media."}</span>
        </label>
        {selectedMedia ? <MetaInput label="Media alt text" value={value.altText || ""} onChange={(v) => onChange("altText", v)} helper="Describe the media for accessibility" /> : null}
        <MetaInput label="Destination URL" value={value.destinationUrl || ""} onChange={(v) => onChange("destinationUrl", v)} helper="Optional; appended to the publication message when not already present" />
        {channel.id === "threads" ? (
          <>
            <MetaSelect label="Who can reply" value={value.replyControl || ""} onChange={(v) => onChange("replyControl", v)} options={[["","Platform default"],["everyone","Everyone"],["accounts_you_follow","Accounts you follow"],["mentioned_only","Mentioned only"]]} />
            <MetaInput label="Topic tag" value={value.topicTag || ""} onChange={(v) => onChange("topicTag", v)} helper="Optional Threads topic tag" />
            <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-black/[0.07] bg-[#FCFBF8] px-4 py-3 text-xs text-[#625B53]">
              <input type="checkbox" checked={value.isSpoilerMedia === true} onChange={(event) => onChange("isSpoilerMedia", event.target.checked)} />
              Mark selected media as spoiler media
            </label>
          </>
        ) : null}
      </MetaSection>

      <div className="mt-4 rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] p-4 text-xs leading-relaxed text-[#7A5A36]">
        Publishing happens only after explicit owner approval. Preflight does not publish. Approved media is resolved from organization storage server-side at execution time.
      </div>
    </div>
  );
}

function GoogleAdsSettings({ state, organizationId, assets = [], walletCurrency = null, organizationTimezone = null, value, onChange }) {
  const executableAssets = assets.filter((asset) => {
    const accountCurrency = String(asset.metadata?.currency_code || "").toUpperCase();
    const organizationCurrency = String(walletCurrency || "").toUpperCase();
    const accountTimezone = String(asset.metadata?.time_zone || "");
    const orgTimezone = String(organizationTimezone || "");
    return asset.metadata?.manager !== true && Boolean(asset.entity_id) && Boolean(accountCurrency) && Boolean(accountTimezone) && (!organizationCurrency || accountCurrency === organizationCurrency) && (!orgTimezone || accountTimezone === orgTimezone);
  });
  const selectedAccount = assets.find((asset) => asset.id === value.accountAssetId) || null;
  return (
    <div className="rounded-[24px] border border-[#D8C2A8] bg-[#FFFDF9] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#3E3730]">Google Ads · Search</div>
          <div className={`mt-1 text-[10px] font-medium ${state?.ready ? "text-emerald-700" : "text-[#A37849]"}`}>{state?.label || "Setup"}{state?.detail ? ` · ${state.detail}` : ""}</div>
        </div>
        {!state?.ready ? <a href={`/workspace/${organizationId}/administration/communications-setup?onboarding=1`} className="rounded-full border border-[#D8B78D] bg-[#FBF4EA] px-3 py-1.5 text-[10px] font-semibold text-[#7A5735]">Open Google Ads Setup</a> : null}
      </div>

      <MetaSection title="Account & Campaign">
        <label className="block">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Spending account</span>
          <select value={value.accountAssetId || ""} onChange={(e) => onChange("accountAssetId", e.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none">
            <option value="">{executableAssets.length ? "Select mapped Google Ads account" : "No executable Google Ads account"}</option>
            {executableAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}{asset.metadata?.currency_code ? ` · ${asset.metadata.currency_code}` : ""}{asset.metadata?.time_zone ? ` · ${asset.metadata.time_zone}` : ""}</option>)}
          </select>
        </label>
        <MiniState label="Organization timezone" value={organizationTimezone || "Not configured"} />
        <MiniState label="Account timezone" value={selectedAccount?.metadata?.time_zone || "Select account"} />
        <MetaInput label="Google Ads authorized budget" type="number" value={value.authorizedBudget || ""} onChange={(v) => onChange("authorizedBudget", v)} helper="Required when the Campaign Budget is split across multiple paid providers" />
        <MetaInput label="Daily budget" type="number" value={value.dailyBudget || ""} onChange={(v) => onChange("dailyBudget", v)} helper="Optional; otherwise calculated from authorized provider budget and dates" />
      </MetaSection>

      <AdvancedSettingsSection title="Advanced Google controls" summary="Ad group naming, Search Partners and manager hierarchy">
        <MetaInput label="Ad group name" value={value.adGroupName || ""} onChange={(v) => onChange("adGroupName", v)} helper="Optional; Avantiqo generates one if empty" />
        <div className="md:col-span-2"><ToggleField label="Include Google Search Partners" checked={value.searchPartners === true} onChange={(next) => onChange("searchPartners", next)} /></div>
        <MiniState label="Manager hierarchy" value={selectedAccount?.metadata?.login_customer_id ? `Managed via ${selectedAccount.metadata.login_customer_id}` : "Direct advertiser account"} />
      </AdvancedSettingsSection>

      <MetaSection title="Targeting">
        <div className="md:col-span-2">
          <GoogleAdsTargetLookup
            label="Included locations"
            organizationId={organizationId}
            accountAssetId={value.accountAssetId || ""}
            lookupType="location"
            value={Array.isArray(value.includedLocations) ? value.includedLocations : []}
            onChange={(targets) => onChange("includedLocations", targets)}
          />
        </div>
        <div className="md:col-span-2">
          <GoogleAdsTargetLookup
            label="Excluded locations"
            organizationId={organizationId}
            accountAssetId={value.accountAssetId || ""}
            lookupType="location"
            value={Array.isArray(value.excludedLocations) ? value.excludedLocations : []}
            onChange={(targets) => onChange("excludedLocations", targets)}
          />
        </div>
        <div className="md:col-span-2">
          <GoogleAdsTargetLookup
            label="Languages"
            organizationId={organizationId}
            accountAssetId={value.accountAssetId || ""}
            lookupType="language"
            value={Array.isArray(value.languages) ? value.languages : []}
            onChange={(targets) => onChange("languages", targets)}
          />
        </div>
      </MetaSection>

      <MetaSection title="Keywords">
        <GoogleKeywordBox label="Exact match" value={value.exactKeywords || ""} onChange={(v) => onChange("exactKeywords", v)} helper="One keyword per line" />
        <GoogleKeywordBox label="Phrase match" value={value.phraseKeywords || ""} onChange={(v) => onChange("phraseKeywords", v)} helper="One keyword per line" />
        <GoogleKeywordBox label="Broad match" value={value.broadKeywords || ""} onChange={(v) => onChange("broadKeywords", v)} helper="Use deliberately; broad expands reach" />
        <GoogleKeywordBox label="Negative keywords" value={value.negativeKeywords || ""} onChange={(v) => onChange("negativeKeywords", v)} helper="One negative phrase per line" />
      </MetaSection>

      <MetaSection title="Responsive Search Ad">
        <div className="md:col-span-2"><GoogleCopyBox label="Headlines" value={value.headlines || ""} onChange={(v) => onChange("headlines", v)} min={3} max={15} charLimit={30} helper="3–15 headlines, one per line" /></div>
        <div className="md:col-span-2"><GoogleCopyBox label="Descriptions" value={value.descriptions || ""} onChange={(v) => onChange("descriptions", v)} min={2} max={4} charLimit={90} helper="2–4 descriptions, one per line" /></div>
        <div className="md:col-span-2"><MetaInput label="Landing page" value={value.landingPage || ""} onChange={(v) => onChange("landingPage", v)} helper="HTTP or HTTPS destination URL" /></div>
      </MetaSection>

      <AdvancedSettingsSection title="Tracking" summary="Optional UTM attribution parameters">
        <MetaInput label="UTM source" value={value.utmSource || ""} onChange={(v) => onChange("utmSource", v)} helper="Example: google" />
        <MetaInput label="UTM medium" value={value.utmMedium || ""} onChange={(v) => onChange("utmMedium", v)} helper="Example: cpc" />
        <MetaInput label="UTM campaign" value={value.utmCampaign || ""} onChange={(v) => onChange("utmCampaign", v)} />
        <MetaInput label="UTM term" value={value.utmTerm || ""} onChange={(v) => onChange("utmTerm", v)} />
        <MetaInput label="UTM content" value={value.utmContent || ""} onChange={(v) => onChange("utmContent", v)} />
      </AdvancedSettingsSection>

      <div className="mt-4 rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] p-4 text-xs leading-relaxed text-[#7A5A36]">
        Google Search execution is paused-first. The spending account must be mapped to an Avantiqo entity and its currency must match the organization wallet.
      </div>
    </div>
  );
}

function GoogleAdsTargetLookup({ label, organizationId, accountAssetId, lookupType, value = [], onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = Array.isArray(value) ? value : [];

  async function search() {
    if (!accountAssetId) {
      setError("Select the Google Ads spending account first.");
      return;
    }
    if (query.trim().length < 2) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/marketing/google-ads-targeting-search?organizationId=${encodeURIComponent(organizationId)}&accountAssetId=${encodeURIComponent(accountAssetId)}&type=${encodeURIComponent(lookupType)}&q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) throw new Error(payload?.error?.message || payload?.error || "Google Ads targeting lookup failed");
      const data = payload?.data || payload?.result || payload;
      setResults(data?.results || []);
    } catch (lookupError) {
      setError(lookupError.message || "Google Ads targeting lookup failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function add(item) {
    if (!item?.id || selected.some((row) => String(row.id) === String(item.id))) return;
    onChange([...selected, {
      id: String(item.id),
      name: item.name || String(item.id),
      resource_name: item.resource_name || null,
      ...(item.country_code ? { country_code: item.country_code } : {}),
      ...(item.target_type ? { target_type: item.target_type } : {}),
      ...(item.code ? { code: item.code } : {}),
    }]);
  }

  function remove(id) {
    onChange(selected.filter((item) => String(item.id) !== String(id)));
  }

  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">{label}</div>
      <div className="mt-1.5 flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              search();
            }
          }}
          placeholder={lookupType === "language" ? "Search language" : "Search country, region, city or postal area"}
          className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none focus:border-[#D6A66A]/50"
        />
        <button type="button" onClick={search} disabled={loading || !accountAssetId} className="rounded-xl border border-[#D8B78D] bg-[#FBF4EA] px-3 py-2 text-[10px] font-semibold text-[#7A5735] disabled:opacity-40">
          {loading ? "Searching…" : "Search"}
        </button>
      </div>
      {!accountAssetId ? <div className="mt-1 text-[10px] text-[#9B9289]">Select a spending account before searching Google Ads targeting constants.</div> : null}
      {error ? <div className="mt-1 text-[10px] text-red-700">{error}</div> : null}
      {results.length ? (
        <div className="mt-2 max-h-44 overflow-auto rounded-xl border border-black/[0.06] bg-white p-1">
          {results.map((item) => (
            <button key={`${lookupType}-${item.id}`} type="button" onClick={() => add(item)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[10px] hover:bg-[#FBF8F3]">
              <span className="truncate text-[#514A43]">{item.name}{item.country_code ? ` · ${item.country_code}` : ""}</span>
              <span className="shrink-0 text-[#9B9289]">{item.target_type || item.code || item.id}</span>
            </button>
          ))}
        </div>
      ) : null}
      {selected.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <button key={item.id} type="button" onClick={() => remove(item.id)} className="rounded-full border border-black/[0.07] bg-[#F7F6F3] px-2.5 py-1 text-[9px] text-[#625B53]">
              {item.name || item.id}{item.country_code ? ` · ${item.country_code}` : ""} ×
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function textareaLines(value) {
  return String(value || "").split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

function GoogleKeywordBox({ label, value, onChange, helper }) {
  const count = textareaLines(value).length;
  return <label className="block"><span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={5} className="mt-1.5 w-full resize-y rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs leading-relaxed text-[#2D2822] outline-none focus:border-[#D6A66A]/50" /><span className="mt-1 flex justify-between text-[10px] text-[#9B9289]"><span>{helper}</span><span>{count}</span></span></label>;
}

function GoogleCopyBox({ label, value, onChange, min, max, charLimit, helper }) {
  const rows = textareaLines(value);
  const invalid = rows.filter((item) => item.length > charLimit).length;
  const countOk = rows.length >= min && rows.length <= max;
  return <label className="block"><span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={6} className={`mt-1.5 w-full resize-y rounded-xl border bg-white px-3 py-2.5 text-xs leading-relaxed text-[#2D2822] outline-none ${countOk && !invalid ? "border-black/[0.08] focus:border-[#D6A66A]/50" : "border-amber-700/30"}`} /><span className="mt-1 flex justify-between gap-3 text-[10px] text-[#9B9289]"><span>{helper} · max {charLimit} characters each</span><span className={countOk && !invalid ? "text-emerald-700" : "text-amber-700"}>{rows.length}/{max}{invalid ? ` · ${invalid} too long` : ""}</span></span></label>;
}

const META_DESTINATION_COMPATIBILITY = Object.freeze({
  ENGAGEMENT: {
    objectives: [["OUTCOME_ENGAGEMENT", "Engagement"]],
    optimizations: [["POST_ENGAGEMENT", "Post engagement"], ["IMPRESSIONS", "Impressions"], ["REACH", "Reach"]],
  },
  WEBSITE: {
    objectives: [["OUTCOME_TRAFFIC", "Traffic"], ["OUTCOME_SALES", "Sales / conversions"]],
    optimizations: [["LINK_CLICKS", "Link clicks"], ["LANDING_PAGE_VIEWS", "Landing page views"], ["OFFSITE_CONVERSIONS", "Website conversions"]],
  },
  WHATSAPP: {
    objectives: [["OUTCOME_ENGAGEMENT", "Engagement"]],
    optimizations: [["CONVERSATIONS", "Conversations"]],
  },
});

function metaCompatibility(destination) {
  return META_DESTINATION_COMPATIBILITY[String(destination || "ENGAGEMENT").toUpperCase()] || META_DESTINATION_COMPATIBILITY.ENGAGEMENT;
}

function MetaAdsSettings({ channel, catalog, state, organizationId, assets = [], creativeAssets = [], value, onChange }) {
  const toggleList = (key, item) => {
    const current = splitList(value[key]);
    const next = current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item];
    onChange(key, next.join(", "));
  };
  const approvedAssets = creativeAssets.filter((asset) => asset.approval_status === "APPROVED" && String(asset.media_kind || "").toUpperCase() === "IMAGE");
  const pageAssets = assets.filter((asset) => asset.provider === "meta" && asset.asset_type === "facebook_page");
  const selectedPage = pageAssets.find((asset) => asset.id === value.pageAssetId) || null;
  const instagramAssets = assets.filter((asset) => asset.provider === "meta" && asset.asset_type === "instagram_business" && (!selectedPage || String(asset.metadata?.facebook_page_id || "") === String(selectedPage.external_id || "")));
  const selectedInstagram = instagramAssets.find((asset) => asset.id === value.instagramAssetId) || null;
  const destinations = (catalog?.available_destinations?.length ? catalog.available_destinations : catalog?.destinations || ["ENGAGEMENT", "WEBSITE", "WHATSAPP"])
    .filter((destination) => ["ENGAGEMENT", "WEBSITE", "WHATSAPP"].includes(String(destination).toUpperCase()));
  const networks = ["facebook", "instagram"].filter((network) => !catalog?.networks?.length || catalog.networks.includes(network));
  const selectedNetworks = splitList(value.networks);
  const selectedGenders = splitList(value.genders);
  const selectedSpecial = splitList(value.specialAdCategories);
  const destination = String(value.destination || "ENGAGEMENT").toUpperCase();
  const compatibility = metaCompatibility(destination);
  const selectedObjective = String(value.objective || "").toUpperCase();
  const selectedOptimization = String(value.optimizationGoal || "").toUpperCase();
  const objectiveOptions = [["", "Automatic from destination / optimization"], ...compatibility.objectives];
  const optimizationOptions = [["", "Automatic"], ...compatibility.optimizations];
  const billingOptions = selectedOptimization === "LINK_CLICKS"
    ? [["IMPRESSIONS", "Impressions"], ["LINK_CLICKS", "Link clicks"]]
    : [["IMPRESSIONS", "Impressions"]];

  return (
    <div className="rounded-[24px] border border-[#D8C2A8] bg-[#FFFDF9] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#3E3730]">Meta Ads · Facebook & Instagram</div>
          <div className={`mt-1 text-[10px] font-medium ${state?.ready ? "text-emerald-700" : "text-[#A37849]"}`}>{state?.label || "Setup"}{state?.detail ? ` · ${state.detail}` : ""}</div>
        </div>
        {!state?.ready ? <a href={`/workspace/${organizationId}/administration/communications-setup?onboarding=1`} className="rounded-full border border-[#D8B78D] bg-[#FBF4EA] px-3 py-1.5 text-[10px] font-semibold text-[#7A5735]">Open Channel Setup</a> : null}
      </div>

      <MetaSection title="Ad Identity">
        <label className="block md:col-span-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Facebook Page · required</span>
          <select value={value.pageAssetId || ""} onChange={(e) => { const nextId = e.target.value; onChange("pageAssetId", nextId); const page = pageAssets.find((asset) => asset.id === nextId); const currentInstagram = assets.find((asset) => asset.id === value.instagramAssetId); if (currentInstagram && String(currentInstagram.metadata?.facebook_page_id || "") !== String(page?.external_id || "")) onChange("instagramAssetId", ""); }} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none">
            <option value="">{pageAssets.length ? "Select Facebook Page" : "No connected Facebook Page"}</option>
            {pageAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Instagram professional account</span>
          <select value={value.instagramAssetId || ""} onChange={(e) => onChange("instagramAssetId", e.target.value)} disabled={!selectedPage} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none disabled:bg-[#F3F0EC] disabled:text-[#9B9289]">
            <option value="">{!selectedPage ? "Select Facebook Page first" : instagramAssets.length ? "Select linked Instagram account" : "No linked Instagram account"}</option>
            {instagramAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
          <span className="mt-1 block text-[10px] text-[#9B9289]">Required only when Instagram is selected as a delivery network. The account must be linked to the selected Page.</span>
        </label>
        <MiniState label="Facebook identity" value={selectedPage?.name || "Not selected"} />
        <MiniState label="Instagram identity" value={selectedInstagram?.name || (selectedPage ? "Not selected" : "Select Page first")} />
      </MetaSection>

      <MetaSection title="Campaign">
        <MetaSelect label="Destination" value={value.destination || "ENGAGEMENT"} onChange={(v) => onChange("destination", v)} options={destinations.map((id) => [id, id.replaceAll("_", " ")])} />
        <MetaSelect label="Objective" value={value.objective || ""} onChange={(v) => onChange("objective", v)} options={objectiveOptions} />
        <MetaSelect label="Optimization goal" value={value.optimizationGoal || ""} onChange={(v) => { onChange("optimizationGoal", v); if (String(v).toUpperCase() !== "LINK_CLICKS" && String(value.billingEvent || "IMPRESSIONS").toUpperCase() === "LINK_CLICKS") onChange("billingEvent", "IMPRESSIONS"); }} options={optimizationOptions} />
        <MetaSelect label="Billing event" value={value.billingEvent || "IMPRESSIONS"} onChange={(v) => onChange("billingEvent", v)} options={billingOptions} />
        {(selectedObjective && !compatibility.objectives.some(([id]) => id === selectedObjective)) || (selectedOptimization && !compatibility.optimizations.some(([id]) => id === selectedOptimization)) ? (
          <div className="md:col-span-2 rounded-xl border border-[#DDBA8B] bg-[#FFF8EC] px-3 py-2 text-[10px] leading-relaxed text-[#7A5A36]">The saved objective or optimization goal is not compatible with this destination. Choose a compatible value before provider preflight.</div>
        ) : null}
        <div className="md:col-span-2">
          <MetaChoice label="Delivery networks" options={networks} selected={selectedNetworks} onToggle={(item) => toggleList("networks", item)} />
        </div>
      </MetaSection>

      <AdvancedSettingsSection title="Advanced delivery controls" summary="Manual placements, device overrides and Special Ad Categories">
        {selectedNetworks.includes("facebook") ? (
          <div className="md:col-span-2">
            <MetaChoice label="Facebook placements" options={["feed","story","facebook_reels","marketplace","video_feeds","right_hand_column","search"]} selected={splitList(value.facebookPositions)} onToggle={(item) => toggleList("facebookPositions", item)} allowEmpty emptyLabel="Automatic" />
          </div>
        ) : null}
        {selectedNetworks.includes("instagram") ? (
          <div className="md:col-span-2">
            <MetaChoice label="Instagram placements" options={["stream","story","reels","explore","explore_home","profile_feed","search"]} selected={splitList(value.instagramPositions)} onToggle={(item) => toggleList("instagramPositions", item)} allowEmpty emptyLabel="Automatic" />
          </div>
        ) : null}
        <div className="md:col-span-2">
          <MetaChoice label="Devices" options={["mobile","desktop"]} selected={splitList(value.devicePlatforms)} onToggle={(item) => toggleList("devicePlatforms", item)} allowEmpty emptyLabel="Automatic" />
        </div>
        <div className="md:col-span-2">
          <MetaChoice label="Special ad categories" options={["HOUSING","EMPLOYMENT","CREDIT","ISSUES_ELECTIONS_POLITICS"]} selected={selectedSpecial} onToggle={(item) => toggleList("specialAdCategories", item)} allowEmpty emptyLabel="None" />
        </div>
        {selectedSpecial.length ? (
          <div className="md:col-span-2 rounded-xl border border-[#DDBA8B] bg-[#FFF8EC] px-3 py-3 text-[10px] leading-relaxed text-[#7A5A36]">
            Draft planning is allowed, but provider preflight remains blocked until Avantiqo has certified the special-ad compliance requirements for this organization and market. This avoids pretending that a category flag alone satisfies Meta policy or jurisdiction-specific requirements.
          </div>
        ) : null}
      </AdvancedSettingsSection>

      <MetaSection title="Audience">
        <MetaInput label="Age minimum" type="number" value={value.ageMin || "18"} onChange={(v) => onChange("ageMin", v)} />
        <MetaInput label="Age maximum" type="number" value={value.ageMax || "65"} onChange={(v) => onChange("ageMax", v)} />
        <div className="md:col-span-2"><MetaChoice label="Gender" options={["male","female"]} selected={selectedGenders} onToggle={(item) => toggleList("genders", item)} allowEmpty emptyLabel="All" /></div>
        <div className="md:col-span-2"><MetaLocationLookup label="Included locations" organizationId={organizationId} value={value} prefix="included" onChange={onChange} /></div>
        <div className="md:col-span-2"><MetaLocationLookup label="Excluded locations" organizationId={organizationId} value={value} prefix="excluded" onChange={onChange} /></div>
      </MetaSection>

      <AdvancedSettingsSection title="Advanced audience" summary="Radius targeting, locales, interests, behaviours and custom audiences">
        <MetaInput label="Radius latitude" type="number" value={value.radiusLatitude || ""} onChange={(v) => onChange("radiusLatitude", v)} />
        <MetaInput label="Radius longitude" type="number" value={value.radiusLongitude || ""} onChange={(v) => onChange("radiusLongitude", v)} />
        <MetaInput label="Radius" type="number" value={value.radius || ""} onChange={(v) => onChange("radius", v)} />
        <MetaSelect label="Radius unit" value={value.radiusUnit || "kilometer"} onChange={(v) => onChange("radiusUnit", v)} options={[["kilometer","Kilometer"],["mile","Mile"]]} />
        <MetaTargetLookup label="Languages / locales" organizationId={organizationId} lookupType="locale" value={value.languageIds || ""} onChange={(v) => onChange("languageIds", v)} />
        <MetaTargetLookup label="Interests" organizationId={organizationId} lookupType="interest" value={value.interestIds || ""} onChange={(v) => onChange("interestIds", v)} />
        <MetaTargetLookup label="Behaviours" organizationId={organizationId} lookupType="behavior" value={value.behaviorIds || ""} onChange={(v) => onChange("behaviorIds", v)} />
        <MetaTargetLookup label="Custom audiences" organizationId={organizationId} lookupType="custom_audience" value={value.customAudienceIds || ""} onChange={(v) => onChange("customAudienceIds", v)} />
        <MetaTargetLookup label="Excluded audiences" organizationId={organizationId} lookupType="custom_audience" value={value.excludedAudienceIds || ""} onChange={(v) => onChange("excludedAudienceIds", v)} />
        <MetaTargetLookup label="Lookalike audiences" organizationId={organizationId} lookupType="custom_audience" value={value.lookalikeAudienceIds || ""} onChange={(v) => onChange("lookalikeAudienceIds", v)} />
      </AdvancedSettingsSection>

      <MetaSection title="Budget & Optimization">
        <MetaInput label="Meta authorized budget" type="number" value={value.authorizedBudget || ""} onChange={(v) => onChange("authorizedBudget", v)} helper="Required when the Campaign Budget is split across multiple paid providers" />
        <MetaSelect label="Budget delivery" value={value.budgetMode || "lifetime"} onChange={(v) => onChange("budgetMode", v)} options={[["lifetime","Lifetime budget"],["daily","Daily budget"]]} />
        {String(value.budgetMode || "lifetime").toLowerCase() === "daily" ? <MetaInput label="Daily budget" type="number" value={value.dailyBudget || ""} onChange={(v) => onChange("dailyBudget", v)} helper="Daily amount must remain within the total authorized Meta budget across the campaign period" /> : <div className="rounded-xl border border-black/[0.06] bg-[#FCFBF8] px-3 py-3 text-[10px] leading-relaxed text-[#817B73]">Lifetime budget uses the full authorized Meta allocation across the campaign schedule.</div>}
      </MetaSection>

      <AdvancedSettingsSection title="Advanced bidding" summary="Optional bid strategy and cap controls">
        <MetaSelect label="Bid strategy" value={value.bidStrategy || "lowest_cost"} onChange={(v) => onChange("bidStrategy", v)} options={[["lowest_cost","Lowest cost"],["bid_cap","Bid cap"],["cost_cap","Cost cap"]]} />
        <MetaInput label="Bid cap" type="number" value={value.bidCap || ""} onChange={(v) => onChange("bidCap", v)} />
        <MetaInput label="Cost cap" type="number" value={value.costCap || ""} onChange={(v) => onChange("costCap", v)} />
      </AdvancedSettingsSection>

      {String(value.destination || "ENGAGEMENT").toUpperCase() === "WEBSITE" ? (
        <MetaSection title="Conversion">
          <div className="md:col-span-2">
            <MetaPixelLookup
              organizationId={organizationId}
              pixelId={value.pixelId || ""}
              pixelName={value.pixelName || ""}
              onSelect={(pixel) => {
                onChange("pixelId", pixel?.id || "");
                onChange("pixelName", pixel?.name || "");
              }}
            />
          </div>
          <MetaSelect
            label="Conversion event"
            value={value.conversionEvent || "PURCHASE"}
            onChange={(v) => onChange("conversionEvent", v)}
            options={[["PURCHASE","Purchase"],["LEAD","Lead"],["COMPLETE_REGISTRATION","Complete registration"],["ADD_TO_CART","Add to cart"],["VIEW_CONTENT","View content"]]}
          />
          <div className="rounded-xl border border-black/[0.06] bg-[#FCFBF8] px-3 py-3 text-[10px] leading-relaxed text-[#817B73]">
            Pixel/event are required only when Optimization Goal is Website conversions.
          </div>
        </MetaSection>
      ) : null}

      <MetaSection title="Creative">
        <label className="block">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Exact approved image</span>
          <select value={value.creativeAssetId || value.assetId || ""} onChange={(e) => onChange("creativeAssetId", e.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none">
            <option value="">Select approved creative</option>
            {approvedAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </label>
        <MetaSelect label="Call to action" value={value.callToAction || "LEARN_MORE"} onChange={(v) => onChange("callToAction", v)} options={[["LEARN_MORE","Learn more"],["BOOK_NOW","Book now"],["SHOP_NOW","Shop now"],["CONTACT_US","Contact us"],["SIGN_UP","Sign up"],["SEND_MESSAGE","Send message"],["WHATSAPP_MESSAGE","WhatsApp message"]]} />
        <div className="md:col-span-2"><MetaInput label="Primary text" value={value.primaryText || ""} onChange={(v) => onChange("primaryText", v)} /></div>
        <MetaInput label="Headline" value={value.headline || ""} onChange={(v) => onChange("headline", v)} />
        <MetaInput label="Description" value={value.description || ""} onChange={(v) => onChange("description", v)} />
        <div className="md:col-span-2"><MetaInput label="Destination URL" value={value.destinationUrl || ""} onChange={(v) => onChange("destinationUrl", v)} helper="Required for website campaigns" /></div>
      </MetaSection>

      <AdvancedSettingsSection title="Tracking" summary="Optional UTM attribution parameters">
        <MetaInput label="UTM source" value={value.utmSource || ""} onChange={(v) => onChange("utmSource", v)} />
        <MetaInput label="UTM medium" value={value.utmMedium || ""} onChange={(v) => onChange("utmMedium", v)} />
        <MetaInput label="UTM campaign" value={value.utmCampaign || ""} onChange={(v) => onChange("utmCampaign", v)} />
        <MetaInput label="UTM content" value={value.utmContent || ""} onChange={(v) => onChange("utmContent", v)} />
      </AdvancedSettingsSection>

      <div className="mt-4 rounded-2xl border border-[#DDBA8B] bg-[#FFF8EC] p-4 text-xs leading-relaxed text-[#7A5A36]">
        Meta execution is paused-first. Exact creative remains locked, standard creative enhancements remain opted out, and Messenger / Audience Network are not enabled by the current managed adapter.
      </div>
    </div>
  );
}

function MetaPixelLookup({ organizationId, pixelId, pixelName, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadPixels() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/marketing/meta-targeting-search?organizationId=${encodeURIComponent(organizationId)}&type=pixel&q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) throw new Error(payload?.error?.message || payload?.error || "Meta Pixel lookup failed");
      const data = payload?.data || payload?.result || payload;
      setResults(data?.results || []);
    } catch (lookupError) {
      setError(lookupError.message || "Meta Pixel lookup failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">Meta Pixel</div>
      <div className="mt-1.5 flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); loadPixels(); } }} placeholder="Search Pixel name, or leave blank to load all" className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none focus:border-[#D6A66A]/50" />
        <button type="button" onClick={loadPixels} disabled={loading} className="rounded-xl border border-[#D8B78D] bg-[#FBF4EA] px-3 py-2 text-[10px] font-semibold text-[#7A5735] disabled:opacity-40">{loading ? "Loading…" : "Load Pixels"}</button>
      </div>
      {error ? <div className="mt-1 text-[10px] text-red-700">{error}</div> : null}
      {results.length ? <div className="mt-2 max-h-40 overflow-auto rounded-xl border border-black/[0.06] bg-white p-1">{results.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[10px] hover:bg-[#FBF8F3]"><span className="truncate text-[#514A43]">{item.name}</span><span className="shrink-0 text-[#9B9289]">{item.last_fired_time ? "Active" : item.id}</span></button>)}</div> : null}
      {pixelId ? <div className="mt-2 flex items-center justify-between rounded-xl border border-emerald-700/15 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-800"><span>{pixelName || pixelId}</span><button type="button" onClick={() => onSelect(null)} className="font-semibold">Clear</button></div> : null}
    </div>
  );
}

function MetaTargetLookup({ label, organizationId, lookupType, value, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = splitList(value);

  async function search() {
    if (lookupType !== "custom_audience" && query.trim().length < 2) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/marketing/meta-targeting-search?organizationId=${encodeURIComponent(organizationId)}&type=${encodeURIComponent(lookupType)}&q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) throw new Error(payload?.error?.message || payload?.error || "Meta lookup failed");
      const data = payload?.data || payload?.result || payload;
      setResults(data?.results || []);
    } catch (lookupError) {
      setError(lookupError.message || "Meta lookup failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function add(id) {
    if (!id || selected.includes(id)) return;
    onChange([...selected, id].join(", "));
  }
  function remove(id) {
    onChange(selected.filter((item) => item !== id).join(", "));
  }

  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">{label}</div>
      <div className="mt-1.5 flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} placeholder={lookupType === "custom_audience" ? "Search or load audiences" : `Search Meta ${label.toLowerCase()}`} className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none focus:border-[#D6A66A]/50" />
        <button type="button" onClick={search} disabled={loading} className="rounded-xl border border-[#D8B78D] bg-[#FBF4EA] px-3 py-2 text-[10px] font-semibold text-[#7A5735] disabled:opacity-40">{loading ? "Searching…" : "Search"}</button>
      </div>
      {error ? <div className="mt-1 text-[10px] text-red-700">{error}</div> : null}
      {results.length ? <div className="mt-2 max-h-40 overflow-auto rounded-xl border border-black/[0.06] bg-white p-1">{results.map((item) => <button key={item.id} type="button" onClick={() => add(item.id)} className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[10px] text-[#514A43] hover:bg-[#FBF8F3]"><span className="truncate">{item.name}</span><span className="ml-3 shrink-0 text-[#9B9289]">{item.id}</span></button>)}</div> : null}
      {selected.length ? <div className="mt-2 flex flex-wrap gap-1.5">{selected.map((id) => <button key={id} type="button" onClick={() => remove(id)} className="rounded-full border border-black/[0.07] bg-[#F7F6F3] px-2.5 py-1 text-[9px] text-[#625B53]">{id} ×</button>)}</div> : null}
    </div>
  );
}

function MetaLocationLookup({ label, organizationId, value, prefix, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fields = {
    country: `${prefix}Countries`,
    region: `${prefix}RegionIds`,
    city: `${prefix}CityIds`,
    zip: `${prefix}PostalIds`,
    postal_code: `${prefix}PostalIds`,
  };

  async function search() {
    if (query.trim().length < 2) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/marketing/meta-targeting-search?organizationId=${encodeURIComponent(organizationId)}&type=location&q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) throw new Error(payload?.error?.message || payload?.error || "Meta location lookup failed");
      const data = payload?.data || payload?.result || payload;
      setResults(data?.results || []);
    } catch (lookupError) {
      setError(lookupError.message || "Meta location lookup failed"); setResults([]);
    } finally { setLoading(false); }
  }

  function add(item) {
    const type = String(item.type || "").toLowerCase();
    const key = fields[type];
    if (!key) return;
    const id = type === "country" ? String(item.country_code || item.id || "").toUpperCase() : String(item.id || "");
    const current = splitList(value[key]);
    if (id && !current.includes(id)) onChange(key, [...current, id].join(", "));
  }
  const selected = Object.entries(fields).flatMap(([type, key]) => splitList(value[key]).map((id) => ({ type, key, id })));

  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">{label}</div>
      <div className="mt-1.5 flex gap-2"><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} placeholder="Search country, region, city or postal code" className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none focus:border-[#D6A66A]/50" /><button type="button" onClick={search} disabled={loading} className="rounded-xl border border-[#D8B78D] bg-[#FBF4EA] px-3 py-2 text-[10px] font-semibold text-[#7A5735] disabled:opacity-40">{loading ? "Searching…" : "Search"}</button></div>
      {error ? <div className="mt-1 text-[10px] text-red-700">{error}</div> : null}
      {results.length ? <div className="mt-2 max-h-44 overflow-auto rounded-xl border border-black/[0.06] bg-white p-1">{results.map((item) => <button key={`${item.type}-${item.id}`} type="button" onClick={() => add(item)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[10px] hover:bg-[#FBF8F3]"><span className="truncate text-[#514A43]">{item.name}{item.region ? ` · ${item.region}` : ""}</span><span className="shrink-0 uppercase text-[#9B9289]">{item.type}</span></button>)}</div> : null}
      {selected.length ? <div className="mt-2 flex flex-wrap gap-1.5">{selected.map((item) => <button key={`${item.key}-${item.id}`} type="button" onClick={() => onChange(item.key, splitList(value[item.key]).filter((id) => id !== item.id).join(", "))} className="rounded-full border border-black/[0.07] bg-[#F7F6F3] px-2.5 py-1 text-[9px] text-[#625B53]">{item.type}: {item.id} ×</button>)}</div> : null}
    </div>
  );
}

function MetaSection({ title, children }) {
  return <section className="mt-5 rounded-2xl border border-black/[0.06] bg-white p-4"><div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#A37849]">{title}</div><div className="grid gap-3 md:grid-cols-2">{children}</div></section>;
}
function AdvancedSettingsSection({ title = "Advanced settings", summary = "Optional controls", children }) {
  return (
    <details className="group mt-5 rounded-2xl border border-black/[0.06] bg-[#FCFBF8]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#A37849]">{title}</div>
          <div className="mt-1 text-[10px] text-[#8A8178]">{summary}</div>
        </div>
        <span className="shrink-0 rounded-full border border-black/[0.07] bg-white px-2.5 py-1 text-[9px] font-semibold text-[#7B7168] group-open:hidden">Show</span>
        <span className="hidden shrink-0 rounded-full border border-[#D8B78D] bg-[#FBF4EA] px-2.5 py-1 text-[9px] font-semibold text-[#7A5735] group-open:inline">Hide</span>
      </summary>
      <div className="grid gap-3 border-t border-black/[0.06] p-4 md:grid-cols-2">{children}</div>
    </details>
  );
}
function MetaInput({ label, value, onChange, type = "text", helper = "" }) {
  return <label className="block"><span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none focus:border-[#D6A66A]/50" />{helper ? <span className="mt-1 block text-[10px] text-[#9B9289]">{helper}</span> : null}</label>;
}
function MetaSelect({ label, value, onChange, options }) {
  return <label className="block"><span className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-xs text-[#2D2822] outline-none focus:border-[#D6A66A]/50">{options.map(([id,name]) => <option key={`${label}-${id || "auto"}`} value={id}>{name}</option>)}</select></label>;
}
function MetaChoice({ label, options, selected, onToggle, allowEmpty = false, emptyLabel = "" }) {
  return <div><div className="text-[9px] uppercase tracking-[0.12em] text-[#8A8178]">{label}</div><div className="mt-2 flex flex-wrap gap-2">{allowEmpty && !selected.length ? <span className="rounded-full border border-black/[0.07] bg-[#F7F6F3] px-3 py-1.5 text-[10px] text-[#777169]">{emptyLabel}</span> : null}{options.map((item) => { const active=selected.includes(item); return <button key={item} type="button" onClick={() => onToggle(item)} className={`rounded-full border px-3 py-1.5 text-[10px] ${active ? "border-[#C99A62] bg-[#FBF3E8] text-[#6B4C2E]" : "border-black/[0.07] bg-white text-[#777169]"}`}>{item.replaceAll("_"," ")}</button>; })}</div></div>;
}

function OrganicSocialReview({ organizationName = "Organization", channelId, settings = {}, assets = [], creativeAssets = [], coreMessage = "", state = null }) {
  const label = channelId === "facebook" ? "Facebook" : channelId === "instagram" ? "Instagram" : channelId === "pinterest" ? "Pinterest" : channelId === "youtube" ? "YouTube" : channelId === "linkedin" ? "LinkedIn" : channelId === "threads" ? "Threads" : channelId === "tiktok" ? "TikTok" : channelId === "google_business" ? "Google Business" : "X";
  const accountId = channelId === "google_business" ? settings.locationAssetId : settings.accountAssetId;
  const account = assets.find((item) => item.id === accountId);
  const creative = creativeAssets.find((item) => item.id === settings.creativeAssetId);
  const message = String(settings.message || coreMessage || "").trim();
  const rows = [
    ["Publishing account", account?.name || "Not selected"],
    ["Execution state", state?.label || "Setup"],
    ["Message", message ? `${message.length.toLocaleString()} characters${settings.message ? " · channel override" : " · campaign core"}` : "Not set"],
    ["Creative", creative?.name || "Text only"],
    ["Media type", creative?.media_kind || "—"],
    ["Destination URL", settings.destinationUrl || "—"],
    ...(channelId === "threads" ? [["Reply control", settings.replyControl || "Platform default"], ["Topic tag", settings.topicTag || "—"], ["Spoiler media", settings.isSpoilerMedia === true ? "Yes" : "No"]] : []),
    ...(channelId === "youtube" ? [["Video title", settings.title || "Not set"], ["Privacy", settings.privacyStatus || "private"], ["Tags", Array.isArray(settings.tags) && settings.tags.length ? settings.tags.join(", ") : "—"], ["Made for kids", settings.madeForKids === true ? "Yes" : "No"]] : []),
    ...(channelId === "pinterest" ? [["Board", settings.boardName || settings.boardId || "Not selected"], ["Pin title", settings.title || "—"], ["Description", settings.description ? `${String(settings.description).length} characters` : "—"]] : []),
    ...(channelId === "tiktok" ? [["Media mode", "Video direct-post"], ["Privacy", settings.privacyLevel || "Not selected"], ["Creator consent", settings.creatorConsent === true ? "Confirmed" : "Required"], ["Comments", settings.disableComment === true ? "Disabled" : "Allowed"], ["Duet", settings.disableDuet === true ? "Disabled" : "Allowed"], ["Stitch", settings.disableStitch === true ? "Disabled" : "Allowed"], ["Branded content", settings.brandOrganicToggle === true ? "Yes" : "No"], ["AIGC disclosure", settings.isAigc === true ? "Yes" : "No"]] : []),
    ...(channelId === "google_business" ? [["Post type", "Standard"], ["Language", settings.languageCode || "en"], ["Call to action", settings.callToActionType || "None"], ["Entity mapped", account?.entity_id ? "Yes" : "No"]] : []),
  ];
  return (
    <div className="rounded-[24px] border border-[#D8C2A8] bg-[#FFFDF9] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs uppercase tracking-[0.16em] text-[#D6A66A]">{label} · Organic</div><div className="text-[10px] text-[#8A8178]">{organizationName}</div></div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">{rows.map(([rowLabel, value]) => <ReviewItem key={rowLabel} label={rowLabel} value={value} />)}</div>
    </div>
  );
}

function reviewAssetName(settings = {}, assets = []) {
  const assetId = settings.accountAssetId || settings.senderAssetId || settings.locationAssetId || null;
  return assets.find((asset) => asset.id === assetId)?.name || (assetId ? "Selected organization asset" : "Not selected");
}

function simpleReviewValue(value) {
  if (Array.isArray(value)) return value.length ? `${value.length} selected` : "—";
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value && typeof value === "object") return "Configured";
  const string = String(value ?? "").trim();
  return string || "—";
}

function OwnedMessagingReview({ organizationName = "Organization", channel, settings = {}, assets = [], state }) {
  const channelId = channel?.id || "messaging";
  const recipientCount = Array.isArray(settings.recipientPartyIds) ? settings.recipientPartyIds.length : 0;
  const rows = [
    ["Sender", reviewAssetName(settings, assets)],
    ["Recipients", recipientCount ? `${recipientCount} explicitly selected` : "No explicit recipients selected"],
    ...(channelId === "email" ? [["Subject", settings.subject || "—"]] : []),
    ...(channelId === "whatsapp" ? [["Template", settings.templateName ? `${settings.templateName} · ${settings.templateLanguage || "language missing"}` : "Not selected"]] : []),
    ...(channelId === "sms" ? (() => { const info = analyzeSmsSegments(settings.messageVariant || settings.message || ""); return [["SMS encoding", info.encoding], ["Estimated SMS segments", String(info.segments)]]; })() : []),
    ["Frequency cap", settings.frequencyCap || "1"],
    ["Execution", "Planning only · activation gate closed"],
  ];
  return (
    <div className="rounded-[24px] border border-[#D8C2A8] bg-[#FFFDF9] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {channel?.logo ? <Image src={channel.logo} alt="" width={20} height={20} className="h-5 w-5 object-contain" /> : null}
          <div className="text-xs uppercase tracking-[0.16em] text-[#D6A66A]">{channel?.name || channelId}</div>
        </div>
        <div className="text-[10px] text-[#8A8178]">{organizationName}</div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">{rows.map(([label, value]) => <ReviewItem key={label} label={label} value={value} />)}</div>
      <div className="mt-3 rounded-xl border border-[#DDBA8B] bg-[#FFF8EC] px-3 py-2 text-[10px] leading-relaxed text-[#7A5A36]">
        {state?.blockers?.length ? <ul className="list-disc space-y-1 pl-4">{[...new Set(state.blockers)].map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : state?.detail || "Campaign broadcast remains planning-only until consent/suppression governance and the channel adapter are certified."}
      </div>
    </div>
  );
}

function PlanningChannelReview({ organizationName = "Organization", channel, settings = {}, assets = [], state }) {
  const ignored = new Set(["accountAssetId", "senderAssetId", "locationAssetId"]);
  const configured = Object.entries(settings)
    .filter(([key, value]) => !ignored.has(key) && value !== "" && value !== null && value !== undefined && !(Array.isArray(value) && !value.length))
    .slice(0, 6);
  const rows = [
    ["Connected asset", reviewAssetName(settings, assets)],
    ["Execution state", state?.label || "Planning only"],
    ...configured.map(([key, value]) => [labelize(key), simpleReviewValue(value)]),
  ];
  return (
    <div className="rounded-[24px] border border-black/[0.07] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {channel?.logo ? <Image src={channel.logo} alt="" width={20} height={20} className="h-5 w-5 object-contain" /> : (() => { const Icon = channel?.icon || Megaphone; return <Icon className="h-5 w-5 text-[#A37849]" />; })()}
          <div className="text-xs uppercase tracking-[0.16em] text-[#8A633C]">{channel?.name || "Channel"}</div>
        </div>
        <div className="text-[10px] text-[#8A8178]">{organizationName}</div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">{rows.map(([label, value]) => <ReviewItem key={`${label}-${String(value)}`} label={label} value={value} />)}</div>
      <div className="mt-3 text-[10px] leading-relaxed text-[#817B73]">{state?.detail || "This channel is retained in the campaign plan but has no active execution adapter yet."}</div>
    </div>
  );
}

function GoogleAdsReview({ organizationName = "Organization", settings = {}, assets = [], currency = "" }) {
  const account = assets.find((item) => item.id === settings.accountAssetId);
  const currencyCode = String(currency || account?.metadata?.currency_code || "").toUpperCase();
  const moneyLabel = (value) => `${currencyCode ? `${currencyCode} ` : ""}${Number(value || 0).toLocaleString()}`;
  const exactCount = textareaLines(settings.exactKeywords).length;
  const phraseCount = textareaLines(settings.phraseKeywords).length;
  const broadCount = textareaLines(settings.broadKeywords).length;
  const essentialRows = [
    ["Spending account", account?.name || "Not selected"],
    ["Authorized Google budget", settings.authorizedBudget ? moneyLabel(settings.authorizedBudget) : "Uses full Campaign Budget when Google Ads is the only paid provider"],
    ["Daily budget", settings.dailyBudget ? moneyLabel(settings.dailyBudget) : "Automatic from authorized provider budget"],
    ["Locations", Array.isArray(settings.includedLocations) && settings.includedLocations.length ? settings.includedLocations.map((item) => item.name || item.id).join(", ") : "Not selected"],
    ["Keywords", `${exactCount} exact · ${phraseCount} phrase · ${broadCount} broad`],
    ["Headlines", `${textareaLines(settings.headlines).length}/15`],
    ["Descriptions", `${textareaLines(settings.descriptions).length}/4`],
    ["Landing page", settings.landingPage || "—"],
  ];
  const advancedRows = [
    ["Account currency", account?.metadata?.currency_code || "—"],
    ["Account timezone", account?.metadata?.time_zone || "—"],
    ["Excluded locations", Array.isArray(settings.excludedLocations) && settings.excludedLocations.length ? settings.excludedLocations.map((item) => item.name || item.id).join(", ") : "None"],
    ["Languages", Array.isArray(settings.languages) && settings.languages.length ? settings.languages.map((item) => item.name || item.id).join(", ") : "Google default"],
    ["Negative keywords", `${textareaLines(settings.negativeKeywords).length} selected`],
    ["Ad group", settings.adGroupName || "Automatic"],
    ["Search Partners", settings.searchPartners === true ? "Included" : "Off"],
    ["Tracking", [settings.utmSource && `source=${settings.utmSource}`, settings.utmMedium && `medium=${settings.utmMedium}`, settings.utmCampaign && `campaign=${settings.utmCampaign}`, settings.utmTerm && `term=${settings.utmTerm}`, settings.utmContent && `content=${settings.utmContent}`].filter(Boolean).join(" · ") || "None"],
  ];
  return (
    <div className="rounded-[24px] border border-[#D8C2A8] bg-[#FFFDF9] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs uppercase tracking-[0.16em] text-[#D6A66A]">Google Ads · Search</div><div className="text-[10px] text-[#8A8178]">{organizationName}</div></div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {essentialRows.map(([label, value]) => <ReviewItem key={label} label={label} value={value} />)}
      </div>
      <ReviewDetails rows={advancedRows} summary="Account, exclusions, network and tracking details" />
    </div>
  );
}

function MetaReview({ organizationName = "Organization", settings = {}, creativeAssets = [], channelAssets = [], currency = "" }) {
  const asset = creativeAssets.find((item) => item.id === (settings.creativeAssetId || settings.assetId));
  const page = channelAssets.find((item) => item.id === settings.pageAssetId && item.asset_type === "facebook_page");
  const instagram = channelAssets.find((item) => item.id === settings.instagramAssetId && item.asset_type === "instagram_business");
  const currencyCode = String(currency || "").toUpperCase();
  const moneyLabel = (value) => `${currencyCode ? `${currencyCode} ` : ""}${Number(value || 0).toLocaleString()}`;
  const essentialRows = [
    ["Facebook Page", page?.name || "Not selected"],
    ["Instagram identity", instagram?.name || (splitList(settings.networks).includes("instagram") ? "Required" : "Not selected")],
    ["Delivery", splitList(settings.networks).join(", ") || "Not selected"],
    ["Destination", settings.destination || "ENGAGEMENT"],
    ["Budget delivery", String(settings.budgetMode || "lifetime").toLowerCase() === "daily" ? `Daily · ${moneyLabel(settings.dailyBudget)}` : "Lifetime"],
    ["Authorized Meta budget", settings.authorizedBudget ? moneyLabel(settings.authorizedBudget) : "Uses full Campaign Budget when Meta is the only paid provider"],
    ["Creative", asset?.name || "Not selected"],
    ["Destination URL", settings.destinationUrl || "—"],
  ];
  const advancedRows = [
    ["Facebook placements", splitList(settings.facebookPositions).join(", ") || "Automatic"],
    ["Instagram placements", splitList(settings.instagramPositions).join(", ") || "Automatic"],
    ["Devices", splitList(settings.devicePlatforms).join(", ") || "Automatic"],
    ["Objective", settings.objective || "Automatic"],
    ["Optimization", settings.optimizationGoal || "Automatic"],
    ["Age", `${settings.ageMin || 18}–${settings.ageMax || 65}`],
    ["Gender", splitList(settings.genders).join(", ") || "All"],
    ["Included countries", splitList(settings.includedCountries).join(", ") || "—"],
    ["Interests", `${splitList(settings.interestIds).length} selected`],
    ["Custom audiences", `${splitList(settings.customAudienceIds).length} selected`],
    ["Lookalikes", `${splitList(settings.lookalikeAudienceIds).length} selected`],
    ["Bid strategy", settings.bidStrategy || "lowest_cost"],
    ["Pixel", settings.pixelName || settings.pixelId || "Not selected"],
    ["Conversion event", settings.conversionEvent || "—"],
    ["CTA", settings.callToAction || "LEARN_MORE"],
    ["Tracking", [settings.utmSource && `source=${settings.utmSource}`, settings.utmMedium && `medium=${settings.utmMedium}`, settings.utmCampaign && `campaign=${settings.utmCampaign}`, settings.utmContent && `content=${settings.utmContent}`].filter(Boolean).join(" · ") || "None"],
  ];
  return (
    <div className="rounded-[24px] border border-[#D8C2A8] bg-[#FFFDF9] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs uppercase tracking-[0.16em] text-[#D6A66A]">Meta / Facebook & Instagram</div><div className="text-[10px] text-[#8A8178]">{organizationName}</div></div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {essentialRows.map(([label, value]) => <ReviewItem key={label} label={label} value={value} />)}
      </div>
      <ReviewDetails rows={advancedRows} summary="Placements, optimization, audience and tracking details" />
    </div>
  );
}

function ReviewDetails({ rows = [], summary = "Advanced review details" }) {
  if (!rows.length) return null;
  return (
    <details className="group mt-3 rounded-2xl border border-black/[0.06] bg-[#FCFBF8]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">Advanced review details</div><div className="mt-0.5 text-[10px] text-[#8A8178]">{summary}</div></div>
        <span className="rounded-full border border-black/[0.07] bg-white px-2.5 py-1 text-[9px] font-semibold text-[#7B7168] group-open:hidden">Show</span>
        <span className="hidden rounded-full border border-[#D8B78D] bg-[#FBF4EA] px-2.5 py-1 text-[9px] font-semibold text-[#7A5735] group-open:inline">Hide</span>
      </summary>
      <div className="grid gap-2 border-t border-black/[0.06] p-3 md:grid-cols-2">{rows.map(([label, value]) => <ReviewItem key={label} label={label} value={value} />)}</div>
    </details>
  );
}

function ReviewItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-[#FCFBF8] p-4">
      <div className="text-[9px] uppercase tracking-[0.13em] text-[#9B9289]">{label}</div>
      <div className="mt-1 text-sm leading-relaxed text-[#4A4138]">{value}</div>
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
