import CommercialSurfacePage from "@/components/public/CommercialSurfacePage";
import { commercialSurfaceConfigs } from "@/components/public/commercialSurfaceConfigs";

export const metadata = {
  title: "Integrations | Avantiqo",
  description: commercialSurfaceConfigs.integrations.description,
};

export default function Page() {
  return <CommercialSurfacePage config={commercialSurfaceConfigs.integrations} />;
}
