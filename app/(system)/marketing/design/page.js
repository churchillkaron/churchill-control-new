"use client";

export const dynamic = "force-dynamic";

import {
  useRef,
  useState,
  useEffect,
} from "react";

import {
  useSearchParams,
} from "next/navigation";

import {
  useTenant,
} from "@/app/providers/TenantProvider";

import {
  useOrganizationRuntime,
} from "@/lib/hooks/useOrganizationRuntime";

import { usePosterState }
from "@/hooks/usePosterState";

import StudioTopBar
from "../../components/marketing/studio/StudioTopBar";

import StudioLeftPanel
from "../../components/marketing/studio/StudioLeftPanel";

import StudioCenterStage
from "../../components/marketing/studio/StudioCenterStage";

import StudioRightPanel
from "../../components/marketing/studio/StudioRightPanel";

import { getQueuedCampaigns }
from "@/lib/marketing/repositories/getQueuedCampaigns";

import { getMetaAccounts }
from "@/lib/marketing/repositories/getMetaAccounts";

import { getGenerationJobs }
from "@/lib/marketing/repositories/getGenerationJobs";

import { getMarketingAssets }
from "@/lib/marketing/repositories/getMarketingAssetsClient";

import { getCampaignRecommendation }
from "@/lib/marketing/ai/recommendations/getCampaignRecommendation";

import { getBestPromptHistory }
from "@/lib/marketing/repositories/getBestPromptHistory";

import { engineCapabilities }
from "@/lib/marketing/ai/router/engineCapabilities";

export default function Page() {
  const tenant = useTenant();

  const searchParams =
    useSearchParams();

  const workspaceRuntime =
    useOrganizationRuntime() || {};

  const {
    organization: runtimeOrganization,
    activeOrganization,
    loading: organizationLoading,
  } = workspaceRuntime;

  const [
    storedOrganization,
    setStoredOrganization,
  ] = useState(null);

  useEffect(() => {
    try {
      const saved =
        window.localStorage.getItem(
          "avantiqo_active_organization"
        );

      if (saved) {
        setStoredOrganization(
          JSON.parse(saved)
        );
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const organization =
    runtimeOrganization ||
    activeOrganization ||
    storedOrganization ||
    null;

  useEffect(() => {
    try {
      if (organization?.id) {
        window.localStorage.setItem(
          "avantiqo_active_organization",
          JSON.stringify(organization)
        );
      }
    } catch (err) {
      console.error(err);
    }
  }, [organization?.id]);

  const tenantId =
    organization?.tenant_id ||
    organization?.tenantId ||
    tenant?.id ||
    null;

  const organizationId =
    searchParams.get("organizationId") ||
    organization?.id ||
    null;

  const poster =
    usePosterState();

  const posterExportNodeRef =
    useRef(null);

  const [loading, setLoading] =
    useState(false);

  const [
    latestCampaign,
    setLatestCampaign,
  ] = useState(null);

  const [
    queuedCampaigns,
    setQueuedCampaigns,
  ] = useState([]);

  const [
    metaAccounts,
    setMetaAccounts,
  ] = useState([]);

  const [
    generationJobs,
    setGenerationJobs,
  ] = useState([]);

  const [
    marketingAssets,
    setMarketingAssets,
  ] = useState([]);

  const [
    activeAsset,
    setActiveAsset,
  ] = useState(null);

  const [
    selectedAssets,
    setSelectedAssets,
  ] = useState([]);

  const [
    promptHistory,
    setPromptHistory,
  ] = useState([]);

  const engineConfig =
    engineCapabilities[
      poster?.engine || "full-ai"
    ] || {};

  const recommendation =
    getCampaignRecommendation({
      assets:
        selectedAssets,
      promptHistory,
    });

  const promptPreview = `
Mood:
${poster?.mood || ""}

Lighting:
${poster?.lighting || ""}

Venue:
${poster?.venue || ""}

Campaign:
${poster?.campaignType || ""}

Atmosphere:
${poster?.atmosphere || ""}

Selected Assets:
${selectedAssets
  .map((a) => a.name)
  .join(", ")}
`;

  useEffect(() => {
    if (!selectedAssets.length) {
      return;
    }

    if (
      recommendation?.mood &&
      poster?.mood !== recommendation.mood
    ) {
      poster.setMood(
        recommendation.mood
      );
    }

    if (
      recommendation?.lighting &&
      poster?.lighting !== recommendation.lighting
    ) {
      poster.setLighting(
        recommendation.lighting
      );
    }
  }, [
    selectedAssets,
    recommendation,
  ]);

  useEffect(() => {
    if (!tenantId) {
      return;
    }

    async function loadData() {
      const assets =
        await getMarketingAssets({
          tenantId,
          organizationId,
        });

      setMarketingAssets(
        assets || []
      );

      const history =
        await getBestPromptHistory({
          tenantId,
          organizationId,
        });

      setPromptHistory(
        history || []
      );

      const accounts =
        await getMetaAccounts({
          tenantId,
          organizationId,
        });

      setMetaAccounts(
        accounts || []
      );

      console.log(
        "META ACCOUNTS:",
        accounts
      );

      if (
        accounts?.length > 0 &&
        !poster.pageId
      ) {
        poster.setPageId(
          accounts[0].page_id
        );
      }

      if (latestCampaign?.id) {
        const response =
          await fetch(
            `/api/marketing/campaign/${latestCampaign.id}`
          );

        const refreshedCampaign =
          await response.json();

        if (
          refreshedCampaign?.id
        ) {
          setLatestCampaign({
            ...refreshedCampaign,
            ...(refreshedCampaign.campaign_content || {}),
          });

          if (
            refreshedCampaign.image_url
          ) {
            poster.setSelectedImage(
              refreshedCampaign.image_url
            );
          }
        }
      }

      const queueData =
        await getQueuedCampaigns({
          tenantId,
          organizationId,
        });

      setQueuedCampaigns(
        queueData || []
      );

      const jobs =
        await getGenerationJobs({
          tenantId,
          organizationId,
        });

      setGenerationJobs(
        jobs || []
      );
    }

    loadData();

    const interval =
      setInterval(() => {
        loadData();
      }, 4000);

    return () =>
      clearInterval(interval);
  }, [
    tenantId,
    organizationId,
    latestCampaign?.id,
  ]);

  async function refreshAssets() {
    const assets =
      await getMarketingAssets({
        tenantId,
        organizationId,
      });

    setMarketingAssets(
      assets || []
    );

    const history =
      await getBestPromptHistory({
        tenantId,
        organizationId,
      });

    setPromptHistory(
      history || []
    );
  }

  async function generateAIImage() {
    try {
      if (!poster?.pageId) {
        alert(
          "Please choose a connected business before generating a campaign."
        );
        return;
      }

      if (
        engineConfig.requiresImage &&
        !selectedAssets.length &&
        !poster.selectedImage
      ) {
        alert(
          "This engine requires a source image. Select an asset or upload an image first."
        );
        return;
      }

      setLoading(true);

      const response =
        await fetch(
          "/api/marketing/generate",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                tenantId,
                organizationId,
                poster,
                selectedAssets,
                pageId:
                  poster.pageId,
                selectedBusiness:
                  metaAccounts.find(
                    (a) =>
                      a.page_id ===
                      poster.pageId
                  ) || null,
              }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          "Generation failed"
        );
      }

      const campaign =
        data.campaign;

      setLatestCampaign({
        ...campaign,
        ...(campaign.campaign_content || {}),
      });

      if (
        engineConfig.supportsVideo &&
        data?.output?.job_id
      ) {
        const pollVideo = async () => {
          try {
            const statusResponse =
              await fetch(
                "/api/marketing/video-status",
                {
                  method: "POST",
                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                  body: JSON.stringify({
                    jobId:
                      data.output.job_id,
                  }),
                }
              );

            const statusData =
              await statusResponse.json();

            if (
              statusData?.status ===
              "completed"
            ) {
              setLatestCampaign(
                (prev) => ({
                  ...prev,
                  video_url:
                    statusData.video_url,
                  image_url:
                    statusData.video_url,
                  is_video:
                    true,
                })
              );

              return;
            }

            if (
              statusData?.status ===
              "failed"
            ) {
              alert(
                statusData.error ||
                "Video failed"
              );

              return;
            }

            setTimeout(
              pollVideo,
              5000
            );
          } catch (err) {
            console.error(
              "VIDEO POLLING ERROR:",
              err
            );
          }
        };

        pollVideo();
      }

      const queueData =
        await getQueuedCampaigns({
          tenantId,
          organizationId,
        });

      setQueuedCampaigns(
        queueData || []
      );

      const jobs =
        await getGenerationJobs({
          tenantId,
          organizationId,
        });

      setGenerationJobs(
        jobs || []
      );
    } catch (err) {
      console.error(
        "CAMPAIGN GENERATION ERROR:",
        err
      );

      alert(
        err.message ||
        "Generation failed"
      );
    } finally {
      setLoading(false);
    }
  }

  async function generateCampaign() {
    try {
      if (!poster?.pageId) {
        alert(
          "Please choose a connected business first."
        );

        return;
      }

      const response =
        await fetch(
          "/api/marketing/generate",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              tenantId,
              organizationId,
              pageId:
                poster.pageId,
              prompt:
                promptPreview,
              poster,
              selectedAssets,
              selectedBusiness:
                metaAccounts.find(
                  (a) =>
                    a.page_id ===
                    poster.pageId
                ) || null,
            }),
          }
        );

      const data =
        await response.json();

      if (data?.campaign) {
        setLatestCampaign({
          ...data.campaign,
          ...(data.campaign?.campaign_content || {}),
        });
      }
    } catch (err) {
      console.error(
        "GENERATE CAMPAIGN ERROR:",
        err
      );
    }
  }

  if (
    !organizationId ||
    !tenantId
  ) {
    return (
      <div className="min-h-screen bg-black p-10 text-white">
        Open Design Studio from an organization workspace.
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#040404] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(214,181,109,0.10),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.055),transparent_28%)]" />

      <div className="relative z-10">
        <StudioTopBar
          poster={poster}
          organization={organization}
        />

        <div className="grid h-[calc(100vh-82px)] grid-cols-[280px_minmax(0,1fr)_340px] gap-5 px-5 pb-5">
          <div className="min-h-0 overflow-hidden rounded-[34px] border border-white/[0.08] bg-white/[0.035] shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur-3xl">
            <StudioLeftPanel
              poster={poster}
              metaAccounts={metaAccounts}
              organization={organization}
            />
          </div>

          <div className="min-h-0 overflow-hidden rounded-[34px] border border-white/[0.06] bg-black/20 shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
            <StudioCenterStage
              poster={poster}
              exportRef={posterExportNodeRef}
              selectedAssets={selectedAssets}
              setSelectedAssets={setSelectedAssets}
              latestCampaign={latestCampaign}
              marketingAssets={marketingAssets}
              setSelectedAssets={setSelectedAssets}
              activeAsset={activeAsset}
              setActiveAsset={setActiveAsset}
              organization={organization}
            />
          </div>

          <div className="min-h-0 overflow-hidden rounded-[34px] border border-white/[0.08] bg-white/[0.035] shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur-3xl">
            <StudioRightPanel
              latestCampaign={latestCampaign}
              queuedCampaigns={queuedCampaigns}
              setQueuedCampaigns={setQueuedCampaigns}
              generationJobs={generationJobs}
              recommendation={recommendation}
              promptPreview={promptPreview}
              promptHistory={promptHistory}
              generateCampaign={generateAIImage}
              setActiveAsset={setActiveAsset}
              organization={organization}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
