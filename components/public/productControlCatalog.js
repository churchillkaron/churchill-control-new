import { productCatalog } from "@/components/public/productCatalog";
import { workforceProductSpec } from "@/components/public/workforceProductSpec";

export const CONTROL_DIMENSIONS = [
  ["engine", "Engine"],
  ["ui", "UI"],
  ["api", "API"],
  ["intelligence", "Intelligence"],
  ["billing", "Billing"],
  ["documentation", "Docs"],
  ["website", "Website"],
  ["tests", "Tests"],
  ["production", "Production"],
];

export const CONTROL_STATE = {
  PROVEN: { label: "Proven", rank: 4 },
  PARTIAL: { label: "Partial", rank: 3 },
  VERIFY: { label: "Verify", rank: 2 },
  NOT_STARTED: { label: "Not started", rank: 1 },
};

function genericCompletion(product) {
  const substantial = product.status === "in_progress" || product.status === "live";
  const foundation = product.status === "foundation";
  return {
    engine: [substantial ? "PARTIAL" : foundation ? "VERIFY" : "NOT_STARTED", "Baseline catalog assessment; verify exact runtime coverage before release."],
    ui: [product.href ? "PARTIAL" : "NOT_STARTED", product.href ? "A public or product surface exists; end-to-end product UI still needs verification." : "No dedicated sellable product surface is wired yet."],
    api: [product.api ? (substantial ? "PARTIAL" : "VERIFY") : "NOT_STARTED", product.api ? "API-capable in the catalog; exact public contract and release proof still need verification." : "No developer API is currently part of this product package."],
    intelligence: [substantial ? "VERIFY" : "NOT_STARTED", "Verify product-specific Business Partner reads, reasoning and governed actions."],
    billing: ["NOT_STARTED", "Standalone entitlement, pricing and billing contract has not been verified."],
    documentation: ["NOT_STARTED", "Sellable setup and operating documentation has not been verified."],
    website: [product.href ? "PARTIAL" : "NOT_STARTED", product.href ? "A route exists; conversion, proof and onboarding still need product verification." : "Catalog entry exists without a dedicated commercial page."],
    tests: [substantial || foundation ? "VERIFY" : "NOT_STARTED", "Underlying tests may exist; standalone product release suite must be verified."],
    production: [product.status === "live" ? "VERIFY" : substantial ? "PARTIAL" : "NOT_STARTED", "Standalone product production certification has not been verified."],
  };
}
function genericRecord(product) {
  const completion = genericCompletion(product);
  const missing = [
    !product.href ? "Dedicated commercial product page" : null,
    "Verified entitlement and billing contract",
    "Standalone release suite",
    "Customer documentation",
    "Production readiness certification",
  ].filter(Boolean);
  return {
    ...product,
    controlSource: "BASELINE",
    controlNote: "Derived baseline. Verify against runtime, UI, tests and production evidence before changing a product to Available.",
    completion,
    missing,
    nextActions: [
      "Verify exact engine and API coverage.",
      "Define the standalone customer journey and entitlement.",
      "Create release tests, documentation and production certification.",
    ],
  };
}

export const productControlCatalog = productCatalog.map((product) => {
  if (product.id === workforceProductSpec.id) {
    return {
      ...product,
      controlSource: "VERIFIED_SPEC",
      controlNote: "Product-specific completion specification established from current Workforce surfaces and runtimes.",
      completion: workforceProductSpec.completion,
      missing: workforceProductSpec.missing,
      nextActions: workforceProductSpec.nextActions,
      specification: workforceProductSpec,
    };
  }
  return genericRecord(product);
});

export function completionScore(record) {
  const values = CONTROL_DIMENSIONS.map(([key]) => CONTROL_STATE[record.completion?.[key]?.[0]]?.rank || 0);
  const max = CONTROL_DIMENSIONS.length * 4;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / max) * 100);
}
