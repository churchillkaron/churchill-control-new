import CommercialSurfacePage from "@/components/public/CommercialSurfacePage";
import { commercialSurfaceConfigs } from "@/components/public/commercialSurfaceConfigs";

export const metadata = {
  title: "Commerce | Avantiqo",
  description: commercialSurfaceConfigs.commerce.description,
};

export default function Page() {
  return <CommercialSurfacePage config={commercialSurfaceConfigs.commerce} />;
}
