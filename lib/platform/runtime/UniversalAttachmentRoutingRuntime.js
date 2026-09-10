const DOMAIN_DESTINATIONS = Object.freeze({
  finance: { domain: "Finance", route: "/finance", label: "Finance" },
  "supply chain": { domain: "Supply Chain", route: "/supply-chain", label: "Supply Chain" },
  people: { domain: "People", route: "/workforce", label: "People" },
  projects: { domain: "Projects", route: "/projects", label: "Projects" },
  operations: { domain: "Operations", route: "/operations", label: "Operations" },
  commercial: { domain: "Commercial", route: "/commercial", label: "Commercial" },
  documents: { domain: "Documents", route: "/documents", label: "Documents" },
  creative: { domain: "Creative", route: "/commercial/marketing/assets", label: "Creative Assets" },
  administration: { domain: "Administration", route: "/administration", label: "Administration" },
  compliance: { domain: "Compliance", route: "/compliance", label: "Compliance" },
});

function text(value) {
  return String(value ?? "").trim();
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function normalized(value) {
  return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
function assetDestination(evidence = {}) {
  const asset = object(evidence.asset_details);
  const joined = [
    evidence.object_type,
    evidence.document_type,
    asset.type,
    asset.asset_type,
    asset.category,
  ].map(normalized).join(" ");
  if (!/\b(asset|equipment|vehicle|property|domain|certificate|device|machine|tool|fleet|building)\b/.test(joined)) return null;
  if (/\b(vehicle|car|truck|motorcycle|trailer|fleet)\b/.test(joined)) {
    return { domain:"Compliance", group:"Assets", workspace:"vehicles", route:"/compliance/assets/vehicles", label:"Vehicles" };
  }
  if (/\b(property|building|leasehold|premises|real estate)\b/.test(joined)) {
    return { domain:"Compliance", group:"Assets", workspace:"properties", route:"/compliance/assets/properties", label:"Properties" };
  }
  if (/\b(domain|ssl|software account|digital asset|certificate)\b/.test(joined)) {
    return { domain:"Compliance", group:"Assets", workspace:"digital_assets", route:"/compliance/assets/digital-assets", label:"Digital Assets" };
  }
  if (/\b(equipment|device|machine|tool|asset)\b/.test(joined)) {
    return { domain:"Compliance", group:"Assets", workspace:"equipment", route:"/compliance/assets/equipment", label:"Equipment" };
  }
  return null;
}

function specializedDestination(evidence = {}) {
  const doc = normalized(evidence.document_type);
  const objectType = normalized(evidence.object_type);
  const asset = assetDestination(evidence);
  if (asset) return asset;
  if (/\b(contract|agreement)\b/.test(`${doc} ${objectType}`)) {
    return { domain:"Documents", group:"Documents", workspace:"contracts", route:"/documents/contracts", label:"Contracts" };
  }
  return null;
}
function domainCandidates(evidence = {}) {
  const unique = new Map();
  for (const value of list(evidence.candidate_domains)) {
    const key = normalized(value);
    const destination = DOMAIN_DESTINATIONS[key];
    if (destination) unique.set(key, destination);
  }
  return [...unique.values()];
}

export function routeAnalyzedAttachment(file = {}) {
  const analysis = object(file.analysis);
  const evidence = object(analysis.evidence);
  if (analysis.status !== "ANALYZED") return null;

  if (analysis.clarification_required === true || evidence.clarification_required === true) {
    return {
      type: "universal_destination",
      status: "CLARIFICATION_REQUIRED",
      destination: null,
      clarification_required: true,
      clarification_question: text(analysis.clarification_question || evidence.clarification_question) ||
        "What business purpose should I use for this file?",
      authorization_effect: "NONE",
    };
  }

  const specialized = specializedDestination(evidence);
  const candidates = domainCandidates(evidence);
  if (specialized) {
    return {
      type: "universal_destination",
      status: "DESTINATION_RESOLVED",
      destination: specialized,
      evidence_classification: {
        object_type: text(evidence.object_type) || null,
        document_type: text(evidence.document_type) || null,
        confidence: Number(evidence.confidence || analysis.confidence) || 0,
      },
      clarification_required: false,
      authorization_effect: "NONE",
    };
  }

  if (candidates.length === 1) {
    return {
      type: "universal_destination",
      status: "DESTINATION_RESOLVED",
      destination: candidates[0],
      evidence_classification: {
        object_type: text(evidence.object_type) || null,
        document_type: text(evidence.document_type) || null,
        confidence: Number(evidence.confidence || analysis.confidence) || 0,
      },
      clarification_required: false,
      authorization_effect: "NONE",
    };
  }

  return {
    type: "universal_destination",
    status: "CLARIFICATION_REQUIRED",
    destination: null,
    candidate_destinations: candidates,
    clarification_required: true,
    clarification_question: candidates.length > 1
      ? `This file could belong to ${candidates.map((item) => item.domain).join(" or ")}. Which business purpose should I use?`
      : "I analyzed the file but cannot determine which Avantiqo area should own it. What business purpose should I use?",
    authorization_effect: "NONE",
  };
}

export default routeAnalyzedAttachment;
