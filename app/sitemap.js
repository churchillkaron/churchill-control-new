import { productCatalog } from "@/components/public/productCatalog";
import { industrySolutionList } from "@/components/public/industrySolutionConfigs";

const BASE = "https://avantiqo.ai";

const staticRoutes = [
  "", "/products", "/business", "/solutions", "/staff-portal", "/documents", "/intelligence-platform",
  "/creative-studios", "/creative-studios/image", "/creative-studios/video", "/creative-studios/music", "/creative-studios/audio",
  "/voice", "/code", "/developers", "/developers/capabilities", "/api-platform", "/integrations", "/compute",
  "/agents", "/channels", "/commerce", "/ecosystem", "/enterprise", "/partners", "/services", "/insights",
  "/pricing", "/resources", "/start", "/restaurant-management-system", "/hotel-operations-software",
  "/business-automation-agents", "/document-extraction", "/invoice-processing", "/gpu-compute", "/ai-video-production",
  "/ai-campaign-production", "/audio-mastering", "/vocal-separation"
];

export default function sitemap() {
  const dynamicRoutes = [
    ...industrySolutionList.map(({ slug }) => `/solutions/${slug}`),
    ...productCatalog.map((product) => product.href || `/products/${product.id}`),
  ];
  const routes = [...new Set([...staticRoutes, ...dynamicRoutes])]
    .filter((route) => !route.startsWith("/login") && !route.startsWith("/subscribe"));

  return routes.map((route) => ({
    url: `${BASE}${route}`,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/products" || route === "/solutions" ? 0.9 : 0.7,
  }));
}
