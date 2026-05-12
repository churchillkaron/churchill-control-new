"use client";

import { useEffect, useState }
from "react";

import { supabase }
from "@/lib/supabase";

export function useMarketingOperations() {

  const [
  stats,
  setStats,
] = useState({
  jobs: [],
  queue: [],
  campaigns: [],
  engineLearningMemory: [],
  loading: true,
});

  const [
    recommendations,
    setRecommendations,
  ] = useState([]);

  const [
    ownerInsights,
    setOwnerInsights,
  ] = useState([]);

  const [
    operationalAlerts,
    setOperationalAlerts,
  ] = useState([]);

  const [
    businesses,
    setBusinesses,
  ] = useState([]);

  const [
    selectedBusiness,
    setSelectedBusiness,
  ] = useState(null);

  useEffect(() => {

    loadBusinesses();

  }, []);

  useEffect(() => {

    if (!selectedBusiness) {
      return;
    }

    loadOperations(
      selectedBusiness
    );

    const jobsChannel =
      supabase
        .channel(
          `generation-jobs-live-${selectedBusiness.page_id}`
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "generation_jobs",
            filter:
              `page_id=eq.${selectedBusiness.page_id}`,
          },
          () => {
            loadJobs(
              selectedBusiness
            );
          }
        )
        .subscribe();

    const queueChannel =
      supabase
        .channel(
          `publish-queue-live-${selectedBusiness.page_id}`
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "campaign_publish_queue",
            filter:
              `page_id=eq.${selectedBusiness.page_id}`,
          },
          () => {
            loadQueue(
              selectedBusiness
            );
          }
        )
        .subscribe();

    const campaignsChannel =
      supabase
        .channel(
          `campaigns-live-${selectedBusiness.page_id}`
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "marketing_campaigns",
            filter:
              `page_id=eq.${selectedBusiness.page_id}`,
          },
          () => {
            loadCampaigns(
              selectedBusiness
            );
          }
        )
        .subscribe();

    return () => {

      supabase.removeChannel(
        jobsChannel
      );

      supabase.removeChannel(
        queueChannel
      );

      supabase.removeChannel(
        campaignsChannel
      );

    };

  }, [selectedBusiness]);

  async function loadBusinesses() {

    try {

      const businessRes =
        await fetch(
          "/api/meta/accounts"
        );

      const businessData =
        await businessRes.json();

      const connectedBusinesses =
        businessData?.accounts || [];

      setBusinesses(
        connectedBusinesses
      );

      if (
        connectedBusinesses.length &&
        !selectedBusiness
      ) {

        setSelectedBusiness(
          connectedBusinesses[0]
        );

      }

      if (
        !connectedBusinesses.length
      ) {

        setStats((prev) => ({
          ...prev,
          loading: false,
        }));

      }

    } catch (err) {

      console.error(err);

      setStats((prev) => ({
        ...prev,
        loading: false,
      }));

    }

  }

  async function postJson(
    url,
    activeBusiness
  ) {

    const response =
      await fetch(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            tenantId:
              activeBusiness?.tenant_id,
            pageId:
              activeBusiness?.page_id,
          }),
        }
      );

    return response.json();

  }

  async function loadJobs(
    activeBusiness
  ) {

    const data =
      await postJson(
        "/api/marketing/jobs",
        activeBusiness
      );

    setStats((prev) => ({
      ...prev,
      jobs:
        data.jobs || [],
    }));

  }

  async function loadQueue(
    activeBusiness
  ) {

    const data =
      await postJson(
        "/api/marketing/queue",
        activeBusiness
      );

    setStats((prev) => ({
      ...prev,
      queue:
        data.queue || [],
    }));

  }

  async function loadCampaigns(
    activeBusiness
  ) {

    const data =
      await postJson(
        "/api/marketing/campaigns",
        activeBusiness
      );

    setStats((prev) => ({
      ...prev,
      campaigns:
        data.campaigns || [],
    }));

  }
  async function loadEngineLearningMemory(
  activeBusiness
) {

  const data =
    await postJson(
      "/api/marketing/engine-learning",
      activeBusiness
    );

  setStats((prev) => ({

    ...prev,

    engineLearningMemory:
      data.learningMemory || [],

  }));

}

  async function loadRecommendations(
    activeBusiness
  ) {

    const data =
      await postJson(
        "/api/marketing/recommendations",
        activeBusiness
      );

    setRecommendations(
      data?.recommendations || []
    );

  }

  async function loadOwnerInsights(
    activeBusiness
  ) {

    const data =
      await postJson(
        "/api/marketing/owner-insights",
        activeBusiness
      );

    setOwnerInsights(
      data?.insights || []
    );

  }

  async function loadOperationalAlerts(
    activeBusiness
  ) {

    const data =
      await postJson(
        "/api/marketing/operational-alerts",
        activeBusiness
      );

    setOperationalAlerts(
      data?.alerts || []
    );

  }

  async function loadOperations(
    activeBusiness
  ) {

    try {

      setStats((prev) => ({
        ...prev,
        loading: true,
      }));

      await Promise.all([

  loadJobs(
    activeBusiness
  ),

  loadQueue(
    activeBusiness
  ),

  loadCampaigns(
    activeBusiness
  ),

  loadEngineLearningMemory(
    activeBusiness
  ),

  loadRecommendations(
    activeBusiness
  ),

  loadOwnerInsights(
    activeBusiness
  ),

  loadOperationalAlerts(
    activeBusiness
  ),

]);

      setStats((prev) => ({
        ...prev,
        loading: false,
      }));

    } catch (err) {

      console.error(err);

      setStats((prev) => ({
        ...prev,
        loading: false,
      }));

    }

  }

  return {

    stats,

    recommendations,

    ownerInsights,

    operationalAlerts,

    businesses,

    selectedBusiness,

    setSelectedBusiness,

  };

}