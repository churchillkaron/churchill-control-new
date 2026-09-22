export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/workspace/", "/workforce/", "/portal/", "/settings/", "/login", "/subscribe", "/hotel-arrival/"],
    },
    sitemap: "https://avantiqo.ai/sitemap.xml",
    host: "https://avantiqo.ai",
  };
}
