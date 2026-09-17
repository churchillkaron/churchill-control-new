import CommercialSurfacePage from "@/components/public/CommercialSurfacePage";
import { commercialSurfaceConfigs } from "@/components/public/commercialSurfaceConfigs";

export const metadata = { title: "Professional Services | Avantiqo", description: commercialSurfaceConfigs.services.description };
export default function Page() { return <CommercialSurfacePage config={commercialSurfaceConfigs.services} />; }
