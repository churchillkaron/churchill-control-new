"use client";

import CodeEngineeringIntelligenceCard from "@/components/operator/CodeEngineeringIntelligenceCard";
import CodeEngineeringPlanCard from "@/components/operator/CodeEngineeringPlanCard";
import ProductEngineeringPortfolioCard from "@/components/operator/ProductEngineeringPortfolioCard";
import { useCodeProgressFeed } from "@/components/operator/CodeProgressFeedProvider";

export default function CodeEngineeringIntelligenceLiveCard({
  organizationId,
  theme = "light",
  compact = false,
  className = "",
}) {
  const { progress } = useCodeProgressFeed();

  if (!progress) return null;

  return (
    <div
      className={`space-y-3 ${className}`}
      data-avantiqo-code-intelligence-live-feed="true"
      data-avantiqo-code-progress-consumer="shared-provider"
    >
      <ProductEngineeringPortfolioCard
        portfolio={progress?.product_engineering_portfolio || null}
        organizationId={organizationId}
        theme={theme}
        compact={compact}
      />
      <CodeEngineeringPlanCard
        plan={progress?.engineering_plan || null}
        theme={theme}
        compact={compact}
      />
      <CodeEngineeringIntelligenceCard
        progress={progress}
        theme={theme}
        compact={compact}
      />
    </div>
  );
}
