import CommercialSurfacePage from "@/components/public/CommercialSurfacePage";
import { commercialSurfaceConfigs } from "@/components/public/commercialSurfaceConfigs";

export const metadata = {
  title: "Pricing | Avantiqo",
  description: commercialSurfaceConfigs.pricing.description,
};

export default function Page() {
  return <CommercialSurfacePage config={commercialSurfaceConfigs.pricing} />;
}
