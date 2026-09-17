import CommercialSurfacePage from "@/components/public/CommercialSurfacePage";
import { commercialSurfaceConfigs } from "@/components/public/commercialSurfaceConfigs";

export const metadata = {
  title: "Solutions | Avantiqo",
  description: commercialSurfaceConfigs.solutions.description,
};

export default function Page() {
  return <CommercialSurfacePage config={commercialSurfaceConfigs.solutions} />;
}
