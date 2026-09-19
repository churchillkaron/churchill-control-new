import ProductLandingPage from "@/components/public/ProductLandingPage";
import { productConfigs } from "@/components/public/productConfigs";

export const metadata = {
  title: "Avantiqo Inventory | Stock, Recipes & Food Cost",
  description: productConfigs.inventory.description,
};

export default function Page(){
  return <ProductLandingPage config={productConfigs.inventory}/>;
}
