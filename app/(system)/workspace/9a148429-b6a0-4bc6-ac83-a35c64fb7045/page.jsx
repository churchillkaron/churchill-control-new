import PlatformAcquisitionControlPanel from "@/components/platform/PlatformAcquisitionControlPanel";
import PlatformCommercialPipelinePanel from "@/components/platform/PlatformCommercialPipelinePanel";
import PlatformCustomerLifecyclePanel from "@/components/platform/PlatformCustomerLifecyclePanel";
import PlatformGrowthTrajectoryPanel from "@/components/platform/PlatformGrowthTrajectoryPanel";
import PlatformIntelligenceProgressPanel from "@/components/platform/PlatformIntelligenceProgressPanel";
import PlatformOwnerHome from "@/components/platform/PlatformOwnerHome";
import styles from "./platform-owner-home.module.css";

export default function AvantiqoPlatformWorkspacePage() {
  return (
    <div className={styles.root}>
      <PlatformOwnerHome />
      <PlatformGrowthTrajectoryPanel />
      <PlatformCustomerLifecyclePanel />
      <PlatformCommercialPipelinePanel />
      <PlatformAcquisitionControlPanel />
      <PlatformIntelligenceProgressPanel />
    </div>
  );
}
