import { createDomainSkeleton } from "../lib/domain-blueprint/createDomainSkeleton.js";

const domains = [
  "hotel",
  "retail",
  "construction",
  "healthcare",
  "warehouse",
  "manufacturing",
  "pest-control",
  "entertainment",
  "education",
  "real-estate",
  "field-service",
  "maintenance",
  "fleet",
  "crm",
  "hr",
  "marketing",
  "projects"
];

for (const domain of domains) {
  createDomainSkeleton(domain);
  console.log("Created domain skeleton:", domain);
}
