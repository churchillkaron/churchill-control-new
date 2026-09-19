import ProductLandingPage from "@/components/public/ProductLandingPage";
import { productConfigs } from "@/components/public/productConfigs";

export const metadata = {
  title: "Avantiqo Finance | Invoicing, Banking & Accounting",
  description: productConfigs.finance.description,
};

export default function Page(){
  return <ProductLandingPage config={productConfigs.finance}/>;
}
