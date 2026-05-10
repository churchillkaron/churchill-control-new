"use client";

export const dynamic =
  "force-dynamic";

import {
  useRef,
  useState,
  useEffect,
}
from "react";

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

import PublishPanel
from "@/app/(system)/components/marketing/studio/PublishPanel";

import GenerationJobsPanel
from "@/app/(system)/components/marketing/studio/GenerationJobsPanel";

import { runCampaignGeneration }
from "@/lib/services/runCampaignGeneration";

import { getQueuedCampaigns }
from "@/lib/supabase/getQueuedCampaigns";

import { getMetaAccounts }
from "@/lib/supabase/getMetaAccounts";

import { getGenerationJobs }
from "@/lib/supabase/getGenerationJobs";

export default function Page() {

  const tenantId =
    "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

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

  useEffect(() => {

    async function loadData() {

      const accounts =
        await getMetaAccounts({

          tenantId,

        });
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

    setLatestCampaign(
      refreshedCampaign
    );

    if (
      refreshedCampaign.image_url
    ) {

      poster.setSelectedImage(
        refreshedCampaign.image_url
      );

    }

  }

}
      setMetaAccounts(
        accounts
      );

      const queueData =
        await getQueuedCampaigns({

          tenantId,

        });

      setQueuedCampaigns(
        queueData
      );

      const jobs =
        await getGenerationJobs({

          tenantId,

        });

      setGenerationJobs(
        jobs
      );

    }

   loadData();

const interval =

  setInterval(() => {

    loadData();

  }, 4000);

return () =>
  clearInterval(interval);

  }, []);

  async function generateAIImage() {

    try {

      setLoading(true);

      const campaign =
        await runCampaignGeneration({

          tenantId,

          poster,

        });

    

      setLatestCampaign(
        campaign
      );

      const queueData =
        await getQueuedCampaigns({

          tenantId,

        });

      setQueuedCampaigns(
        queueData
      );

      const jobs =
        await getGenerationJobs({

          tenantId,

        });

      setGenerationJobs(
        jobs
      );

    } catch (err) {

      console.error(
        "CAMPAIGN GENERATION ERROR:",
        err
      );

      console.error(
        "FULL GENERATION ERROR:",
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

  return (

    <div
      className="
        min-h-screen
        bg-black
        text-white
        overflow-hidden
      "
    >

      <StudioTopBar
        poster={poster}
      />

      <div
        className="
          relative
          h-[calc(100vh-90px)]
        "
      >

        <StudioLeftPanel
          poster={poster}
          metaAccounts={
            metaAccounts
          }
        />

        <StudioCenterStage
          poster={poster}
          exportRef={
            posterExportNodeRef
          }
        />

        <div
          className="
            absolute
            right-8
            top-8
            bottom-8
            w-[380px]
            flex
            flex-col
            gap-6
            overflow-y-auto
            pr-2
            z-20
          "
        >

          <PublishPanel
            loading={loading}
            generateAIImage={
              generateAIImage
            }
            exportRef={
              posterExportNodeRef
            }
            latestCampaign={
              latestCampaign
            }
          />

          <StudioRightPanel
            latestCampaign={
              latestCampaign
            }
            queuedCampaigns={
              queuedCampaigns
            }
            setQueuedCampaigns={
              setQueuedCampaigns
            }
          />

          <GenerationJobsPanel
            jobs={generationJobs}
          />

        </div>

      </div>

    </div>

  );

}