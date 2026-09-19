import CommercialSurfacePage from "@/components/public/CommercialSurfacePage";
import { commercialSurfaceConfigs } from "@/components/public/commercialSurfaceConfigs";

export const metadata = {
  title: "Agents | Avantiqo",
  description: commercialSurfaceConfigs.agents.description,
};

export default function Page() {
  return <CommercialSurfacePage config={commercialSurfaceConfigs.agents} />;
}
