"use client";

import OperationsCharts
from "../../components/marketing/OperationsCharts";

import { useMarketingOperations }
from "@/hooks/useMarketingOperations";

import OperationsHeader
from "../../components/marketing/operations/OperationsHeader";

import OperationsJobStats
from "../../components/marketing/operations/OperationsJobStats";

import OperationsQueueStats
from "../../components/marketing/operations/OperationsQueueStats";

import OperationsAlerts
from "../../components/marketing/operations/OperationsAlerts";

import OperationsRecommendations
from "../../components/marketing/operations/OperationsRecommendations";

import OperationsInsights
from "../../components/marketing/operations/OperationsInsights";

import OperationsCampaigns
from "../../components/marketing/operations/OperationsCampaigns";

import OperationsExecutionFeed
from "../../components/marketing/operations/OperationsExecutionFeed";

import OperationsEnginePerformance
from "../../components/marketing/operations/OperationsEnginePerformance";

import { calculateEnginePerformance }
from "@/lib/marketing/ai/performance/calculateEnginePerformance";

import OperationsEngineStrategy
from "../../components/marketing/operations/OperationsEngineStrategy";

import { analyzeEngineLearning }
from "@/lib/marketing/ai/learning/analyzeEngineLearning";

export default function MarketingOperationsPage() {

  const {

    stats,

    recommendations,

    ownerInsights,

    operationalAlerts,

    businesses,

    selectedBusiness,

    setSelectedBusiness,

  } = useMarketingOperations();

  const jobCounts = {

    queued:
      stats.jobs.filter(
        (j) => j.status === "queued"
      ).length,

    processing:
      stats.jobs.filter(
        (j) => j.status === "processing"
      ).length,

    retrying:
      stats.jobs.filter(
        (j) => j.status === "retrying"
      ).length,

    completed:
      stats.jobs.filter(
        (j) => j.status === "completed"
      ).length,

    failed:
      stats.jobs.filter(
        (j) => j.status === "failed"
      ).length,

    permanently_failed:
      stats.jobs.filter(
        (j) =>
          j.status ===
          "permanently_failed"
      ).length,

  };

  const publishCounts = {

    queued:
      stats.queue.filter(
        (q) => q.status === "queued"
      ).length,

    publishing:
      stats.queue.filter(
        (q) => q.status === "publishing"
      ).length,

    published:
      stats.queue.filter(
        (q) => q.status === "published"
      ).length,

    failed:
      stats.queue.filter(
        (q) => q.status === "failed"
      ).length,

  };

  const enginePerformance =

    calculateEnginePerformance({

      jobs:
        stats.jobs,

      campaigns:
        stats.campaigns,

    });
const engineStrategy =

  analyzeEngineLearning({

    learningMemory:
      stats.engineLearningMemory || [],

  });
  return (

    <div className="space-y-8">

      <OperationsHeader

        businesses={
          businesses
        }

        selectedBusiness={
          selectedBusiness
        }

        setSelectedBusiness={
          setSelectedBusiness
        }

      />

      {stats.loading ? (

        <div className="text-white/60">
          Loading operations...
        </div>

      ) : (

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

          {/* LEFT COLUMN */}

          <div className="xl:col-span-4 space-y-6">

            <OperationsJobStats
              jobCounts={
                jobCounts
              }
            />

            <OperationsQueueStats
              publishCounts={
                publishCounts
              }
            />

            <OperationsAlerts
              operationalAlerts={
                operationalAlerts
              }
            />

          </div>

          {/* CENTER COLUMN */}

          <div className="xl:col-span-5 space-y-6">

            <OperationsCharts

              campaigns={
                stats.campaigns
              }

              queue={
                stats.queue
              }

            />

            <OperationsRecommendations
              recommendations={
                recommendations
              }
            />

            <OperationsExecutionFeed

              jobs={
                stats.jobs
              }

              queue={
                stats.queue
              }

              campaigns={
                stats.campaigns
              }

            />

            <OperationsEnginePerformance

              enginePerformance={
                enginePerformance
              }

            />

          </div>

          {/* RIGHT COLUMN */}

          <div className="xl:col-span-3 space-y-6">

            <OperationsInsights
              ownerInsights={
                ownerInsights
              }
            />

            <OperationsCampaigns
              campaigns={
                stats.campaigns
              }
            />
<OperationsEngineStrategy

  strategy={
    engineStrategy.strategy
  }

  failingEngines={
    engineStrategy.failingEngines
  }

/>
          </div>

        </div>

      )}

    </div>

  );

}