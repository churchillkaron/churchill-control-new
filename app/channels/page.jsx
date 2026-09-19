import CommercialSurfacePage from "@/components/public/CommercialSurfacePage";
import { commercialSurfaceConfigs } from "@/components/public/commercialSurfaceConfigs";

export const metadata = {
  title: "Channels | Avantiqo",
  description: commercialSurfaceConfigs.channels.description,
};

export default function Page() {
  return <CommercialSurfacePage config={commercialSurfaceConfigs.channels} />;
}
