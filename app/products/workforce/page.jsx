import ProductLandingPage from "@/components/public/ProductLandingPage";
import { productConfigs } from "@/components/public/productConfigs";

export const metadata = {
  title: "Avantiqo Workforce | Scheduling, Attendance & Payroll",
  description: productConfigs.workforce.description,
};

export default function Page(){
  return <ProductLandingPage config={productConfigs.workforce}/>;
}
