import PlatformGrowthTrajectoryPanel from "@/components/platform/PlatformGrowthTrajectoryPanel";
import PlatformIntelligenceProgressPanel from "@/components/platform/PlatformIntelligenceProgressPanel";
import PlatformOwnerHome from "@/components/platform/PlatformOwnerHome";
import styles from "./platform-owner-home.module.css";

export default function AvantiqoPlatformWorkspacePage() {
  return (
    <div className={styles.root}>
      <PlatformOwnerHome />
      <PlatformGrowthTrajectoryPanel />
      <PlatformIntelligenceProgressPanel />
    </div>
  );
}
