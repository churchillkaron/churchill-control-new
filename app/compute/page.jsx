import CommercialSurfacePage from "@/components/public/CommercialSurfacePage";
import { commercialSurfaceConfigs } from "@/components/public/commercialSurfaceConfigs";

export const metadata = {
  title: "Compute | Avantiqo",
  description: commercialSurfaceConfigs.compute.description,
};

export default function Page() {
  return <CommercialSurfacePage config={commercialSurfaceConfigs.compute} />;
}
