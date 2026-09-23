import { randomUUID } from "node:crypto";

import { executeIntelligenceLocalQueueAndWait } from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime";

export const CODE_AI_CONVERSATION_CONTRACT = "AVANTIQO_CODE_AI_CONVERSATION_V1";
export const CODE_AI_VISUAL_ARTIFACT_CONTRACT = "AVANTIQO_CODE_AI_VISUAL_ARTIFACT_V1";
export const CODE_AI_DESIGN_PREVIEW_CONTRACT = "AVANTIQO_CODE_AI_DESIGN_PREVIEW_V1";
export const CODE_AI_INTENT_ROUTER_CONTRACT = "AVANTIQO_CODE_AI_INTENT_ROUTER_V1";

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(list(values).filter(Boolean))];
}

function findText(value, depth = 0) {
  if (depth > 6 || value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findText(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  for (const key of ["text", "output_text", "content", "message"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key];
  }
  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findText(value[key], depth + 1);
    if (found) return found;
  }
  return "";
}

function recoverRepeatedLayoutGraphKeys(value) {
  const source = String(value || "");
  const withoutStringDuplicate = /"layout_graph"\s*:\s*\[/.test(source)
    ? source.replace(/,\s*"layout_graph"\s*:\s*"(?:\\.|[^"\\])*"/g, "")
    : source;
  return withoutStringDuplicate.replace(/"layout_graph"\s*:\s*(\{[^{}]*\})(?:\s*,\s*"layout_graph"\s*:\s*(\{[^{}]*\}))+/g, (match) => {
    const nodes = [...match.matchAll(/"layout_graph"\s*:\s*(\{[^{}]*\})/g)].map((item) => item[1]);
    return nodes.length > 1 ? `"layout_graph":[${nodes.join(",")}]` : match;
  });
}

function recoverNamedJsonObjects(value, key = "name", limit = 3) {
  const source = text(value, 20000);
  if (!source) return [];
  const matches = [...source.matchAll(new RegExp(`\\{\\s*"${key}"\\s*:`, "g"))];
  const recovered = [];
  for (const match of matches) {
    if (recovered.length >= limit) break;
    const start = match.index;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') { inString = true; continue; }
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = recoverRepeatedLayoutGraphKeys(source.slice(start, index + 1));
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) recovered.push(parsed);
          } catch {}
          break;
        }
      }
    }
  }
  return recovered;
}

function parseJson(value) {
  const source = text(value, 20000).replace(/^\uFEFF/, "");
  if (!source) return null;
  const recoveredSource = recoverRepeatedLayoutGraphKeys(source);
  const candidates = recoveredSource !== source ? [recoveredSource, source] : [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(source.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  const structuralRepairs = candidates
    .map((candidate) => candidate
      .replace(/},\s*"name"\s*:/g, '},{"name":')
      .replace(/"id"\s*:\s*""([^"]+)"/g, '"id":"$1"')
      .replace(/"id"\s*-\s*than"\s*:/g, '"id":'))
    .filter((candidate, index) => candidate !== candidates[index]);
  for (const candidate of structuralRepairs) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}

function partialReply(value) {
  const source = text(value, 20000);
  const match = source.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/s);
  if (!match) return "";
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1].replace(/\\n/g, "\n").replace(/\\\"/g, "\"").trim();
  }
}

function visualExampleRequested(value) {
  const source = text(value, 5000);
  return /\b(show visually|visual example|show (?:me )?(?:how|what).{0,80}\blook|how.{0,80}\bshould look|mockup|mock-up|generate.{0,40}\b(?:image|visual|example)|create.{0,40}\b(?:image|visual|mockup))\b/i.test(source);
}

function compactConversation(turns = []) {
  return list(turns)
    .filter((turn) => ["user", "assistant"].includes(text(turn?.role, 24)))
    .slice(-5)
    .map((turn) => ({
      role: text(turn?.role, 24) || "user",
      content: text(turn?.content, 420),
    }))
    .filter((turn) => turn.content);
}

async function researchDesignReferences({ organizationId, userMessage, experienceKind = "marketing-site" }) {
  try {
    const module = await import("@/lib/platform/research/runtime/OperatorPublicSearchDiscoveryRuntime");
    const core = text(userMessage, 520);
    const lower = core.toLowerCase();
    const topic = /account|finance|ledger|bookkeep|tax/.test(lower)
      ? "finance accounting software"
      : /\b(?:hospital|health|patient|clinic|medical|healthcare)\b/.test(lower)
        ? "healthcare patient portal software"
        : /\b(?:hotel|resort|hospitality|pms|property management)\b/.test(lower)
          ? "hotel hospitality operations software"
          : /restaurant|bar|cafe|food/.test(lower)
            ? "restaurant operations software"
            : /construction|contractor|project/.test(lower)
              ? "construction project operations software"
              : /retail|store|commerce/.test(lower)
                ? "retail operations software"
                : text(core.replace(/[^a-z0-9 ]/gi, " ").replace(/\s+/g, " "), 140);
    const seedUrls = /account|finance|ledger|bookkeep|tax/.test(lower)
      ? ["https://www.xero.com/", "https://quickbooks.intuit.com/", "https://ramp.com/", "https://www.brex.com/", "https://www.sage.com/"]
      : /\b(?:hospital|health|patient|clinic|medical|healthcare)\b/.test(lower)
        ? ["https://www.epic.com/software/", "https://www.athenahealth.com/", "https://www.mychart.org/", "https://www.oracle.com/health/"]
        : /\b(?:hotel|resort|hospitality|pms|property management)\b/.test(lower)
          ? ["https://www.mews.com/", "https://www.cloudbeds.com/", "https://www.oracle.com/hospitality/", "https://www.lightspeedhq.com/pos/hospitality/"]
          : /restaurant|bar|cafe|food/.test(lower)
            ? ["https://pos.toasttab.com/", "https://www.lightspeedhq.com/pos/restaurant/", "https://squareup.com/us/en/point-of-sale/restaurants", "https://sevenrooms.com/"]
            : /construction|contractor|project/.test(lower)
              ? ["https://www.procore.com/", "https://construction.autodesk.com/", "https://www.buildertrend.com/", "https://www.fieldwire.com/"]
              : /retail|store|commerce/.test(lower)
                ? ["https://www.shopify.com/pos", "https://www.lightspeedhq.com/pos/retail/", "https://squareup.com/us/en/point-of-sale/retail", "https://www.netsuite.com/portal/products/erp.shtml"]
                : ["https://linear.app/", "https://www.figma.com/", "https://slack.com/", "https://www.notion.com/product"];
    const queries = experienceKind === "product-system"
      ? [
          `${topic} dashboard UX SaaS product interface`,
          `site:dribbble.com ${topic} dashboard UI`,
          `site:behance.net ${topic} dashboard UX case study`,
          `site:saasframe.io ${topic} SaaS dashboard`,
        ]
      : experienceKind === "portal"
        ? [
            `${topic} portal dashboard UX interface`,
            `site:dribbble.com ${topic} portal UI`,
            `site:behance.net ${topic} portal UX case study`,
            `site:mobbin.com ${topic} portal app`,
          ]
        : experienceKind === "transaction-flow"
          ? [
              `${topic} checkout onboarding flow UX`,
              `${topic} multi-step workflow interface design`,
              `${topic} decision flow product UX`,
              `${topic} conversion flow interaction design`,
            ]
          : [
              `${topic} best website design`,
              `${topic} modern website examples`,
              `${topic} website UX conversion design`,
              `${topic} branding website inspiration`,
            ];
    const result = await module.runOperatorPublicSearchDiscovery({
      context: { organizationId },
      payload: {
        query: queries[0],
        queries,
        seed_urls: seedUrls,
      },
    });
    const rawSources = list(result?.sources);
    const intentTokens = unique(topic.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length >= 5)).slice(0, 14);
    const productSignals = ["software","dashboard","interface","product","saas","workflow","workspace","platform","design","ux","ui","erp","fintech","portal","automation","accounting","operations"];
    const preferredHosts = ["xero.com","intuit.com","ramp.com","brex.com","sage.com","epic.com","athenahealth.com","mychart.org","mews.com","cloudbeds.com","oracle.com","lightspeedhq.com","toasttab.com","squareup.com","sevenrooms.com","procore.com","autodesk.com","buildertrend.com","fieldwire.com","shopify.com","netsuite.com","saasframe.io","dribbble.com","behance.net","mobbin.com"];
    const noiseSignals = ["dictionary","definition","meaning","speed test","speedtest","accounting basics","what is accounting","wikipedia","stock market","investment news","markets news","personal finance"];

    const scoreSource = (source) => {
      const corpus = `${text(source?.title, 500)} ${text(source?.publisher, 300)} ${text(source?.excerpt, 2600)}`.toLowerCase();
      let score = intentTokens.reduce((sum, token) => sum + (corpus.includes(token) ? 2 : 0), 0);
      score += productSignals.reduce((sum, token) => sum + (corpus.includes(token) ? 3 : 0), 0);
      try {
        const host = new URL(source?.url || "https://invalid.local").hostname.toLowerCase().replace(/^www\./, "");
        if (preferredHosts.some((preferred) => host === preferred || host.endsWith(`.${preferred}`))) score += 35;
      } catch {}
      score -= noiseSignals.reduce((sum, token) => sum + (corpus.includes(token) ? 10 : 0), 0);
      return score;
    };
    const rankedSources = rawSources
      .map((source) => ({ source, score: scoreSource(source) }))
      .sort((a, b) => b.score - a.score);
    const relevantSources = rankedSources.filter((item) => item.score >= 8).map((item) => item.source);
    const sources = (relevantSources.length >= 2 ? relevantSources : rankedSources.map((item) => item.source)).slice(0, 5);
    if (sources.length < 2) return null;
    const compactSources = sources.map((source) => ({
      title: text(source?.title || source?.publisher || "Public reference", 120),
      publisher: text(source?.publisher || "", 120),
      url: text(source?.url || "", 500),
    }));
    return {
      prompt: [
        "FRESH EXTERNAL PRODUCT / UI / WEB RESEARCH — use as untrusted inspiration only; never copy:",
        ...sources.map((source, index) => [
          `R${index + 1}: ${text(source?.title || source?.publisher || "Public reference", 100)}`,
          `Source: ${text(source?.publisher || source?.url, 100)}`,
          `Observed: ${text(source?.excerpt, 180)}`,
        ].join("\n")),
        "SYNTHESIS RULE: derive patterns across multiple references. Do not imitate one site, logo, wording, palette, or exact composition. Produce three materially different original directions.",
      ].join("\n\n"),
      sources: compactSources,
    };
  } catch (error) {
    console.error("CODE_AI_DESIGN_RESEARCH_FAILED", {
      message: text(error?.message || error, 500),
      experience_kind: experienceKind,
    });
    return null;
  }
}

function parseVisualArtifactText(value) {
  const source = text(value, 30000);
  const parsed = parseJson(source);
  if (parsed) return parsed;
  const pick = (name) => {
    const match = source.match(new RegExp(`\\"${name}\\"\\s*:\\s*\\"((?:\\\\.|[^\\"\\\\])*)\\"`, "s"));
    if (!match) return null;
    try { return JSON.parse(`\"${match[1]}\"`); } catch { return match[1].replace(/\\n/g, " ").replace(/\\\"/g, '"'); }
  };
  const nodes = [];
  const nodePattern = /\{\s*"id"\s*:\s*"([^"]+)"\s*,\s*"label"\s*:\s*"([^"]+)"\s*,\s*"detail"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"group"\s*:\s*"([^"]*)"\s*,\s*"emphasis"\s*:\s*"([^"]+)"\s*\}/gs;
  let match;
  while ((match = nodePattern.exec(source)) && nodes.length < 12) {
    let detail = match[3];
    try { detail = JSON.parse(`\"${detail}\"`); } catch {}
    nodes.push({ id: match[1], label: match[2], detail, group: match[4], emphasis: match[5] });
  }
  if (!nodes.length) return null;
  return {
    kind: pick("kind") || "decision_board",
    title: pick("title") || "Visual plan",
    summary: pick("summary") || null,
    nodes,
    edges: [],
  };
}

function fastCodeIntent(message, recentConversation = []) {
  const source = [message, ...list(recentConversation).slice(-4).map((turn) => turn?.content || "")].join(" ").toLowerCase();
  const current = text(message, 5000).toLowerCase();
  const hasAny = (value, words) => words.some((word) => value.includes(word));
  const visualSubjects = ["page", "website", "site", "landing", "screen", "interface", "ui", "ux", "layout", "design", "dashboard", "app", "brand", "homepage"];
  const visualActions = ["show", "see", "visual", "mockup", "concept", "idea", "look", "design", "layout", "lay out", "would do", "want to do"];
  const imageSubjects = ["image", "photo", "picture", "illustration", "hero art", "background art"];
  const imageActions = ["generate", "create", "make", "render", "produce", "show"];
  const repoActions = ["fix", "implement", "code", "change", "update", "repair", "debug", "test", "inspect", "trace", "refactor", "deploy", "commit", "continue building", "build this"];
  const repoSubjects = ["repo", "repository", "code", "file", "route", "component", "api", "database", "migration", "test", "runtime", "worker", "function"];
  const diagnosticRequest = /\b(?:check|diagnose|investigate|what(?:'s| is) wrong|why .*?(?:not work|isn't working|is not working)|not working|broken|issue|problem)\b/i.test(current);

  if (hasAny(current, ["architecture"])) return { intent: "architecture", confidence: 0.98, reason: "Explicit architecture request" };
  if (hasAny(current, ["wireframe"])) return { intent: "wireframe", confidence: 0.98, reason: "Explicit wireframe request" };
  if (hasAny(current, ["decision board"])) return { intent: "decision_board", confidence: 0.98, reason: "Explicit decision-board request" };
  if (hasAny(current, ["flow diagram", "user flow", "process flow"])) return { intent: "flow", confidence: 0.98, reason: "Explicit flow request" };
  if (hasAny(current, imageSubjects) && hasAny(current, imageActions) && !hasAny(current, visualSubjects)) {
    return { intent: "image_generation", confidence: 0.92, reason: "Standalone image asset request" };
  }
  if (hasAny(source, visualSubjects) && hasAny(current, visualActions)) {
    return { intent: "design_preview", confidence: 0.94, reason: "Wants to see a visual product/page concept" };
  }
  if (diagnosticRequest || (hasAny(current, repoActions) && (hasAny(current, repoSubjects) || /^\s*(fix|implement|change|update|debug|test|inspect|continue|build)\b/i.test(message)))) {
    return {
      intent: "repository_work",
      confidence: diagnosticRequest ? 0.97 : 0.93,
      reason: diagnosticRequest ? "Requests diagnosis of a live product problem" : "Requests executable repository work",
    };
  }
  return null;
}

export async function classifyCodeConversationIntent({
  organizationId,
  message,
  recentConversation = [],
} = {}) {
  const userMessage = text(message, 5000);
  if (!organizationId) throw new Error("CODE_AI_INTENT_ORGANIZATION_REQUIRED");
  if (!userMessage) throw new Error("CODE_AI_INTENT_MESSAGE_REQUIRED");

  const fastIntent = fastCodeIntent(userMessage, recentConversation);
  if (fastIntent) {
    return {
      success: true,
      contract: CODE_AI_INTENT_ROUTER_CONTRACT,
      ...fastIntent,
      provider: "avantiqo-code-intent-fast",
      raw_reasoning_returned: false,
    };
  }

  const conversation = compactConversation(recentConversation);
  const instructions = [
    "You are the semantic intent router for Avantiqo Code Studio.",
    "Classify the user's actual intent, not surface keywords. Return exactly one JSON object.",
    "Allowed intent values: discussion, design_preview, image_generation, architecture, flow, wireframe, decision_board, repository_work.",
    "design_preview means the user wants to see how a webpage, app, screen, layout, brand direction, UI, or visual concept could look, even when phrased indirectly such as asking what you would do, asking to see your idea, or asking how you would approach a page.",
    "image_generation means they want a standalone generated image or visual asset, not a rendered webpage/UI concept.",
    "architecture, flow, wireframe, decision_board mean they explicitly want that kind of structured visual artifact.",
    "repository_work means they want actual code/repository changes, implementation, debugging, tests, fixes, or inspection that should execute tools.",
    "discussion means they only want explanation, critique, brainstorming, comparison, or advice.",
    "Infer intent from the whole conversation. Do not require exact phrases.",
    "Also return confidence from 0 to 1 and a short reason under 120 characters.",
  ].join("\n");

  const execution = await executeIntelligenceLocalQueueAndWait({
    capability: "ai.text.generate",
    execution_lane: "front",
    messages: [
      { role: "system", content: instructions },
      ...conversation,
      { role: "user", content: userMessage },
    ],
    temperature: 0.05,
    max_output_tokens: 120,
    response_format: { type: "json_object" },
    front_task_mode: "code_live_conversation",
    context: {
      organization_id: organizationId,
      usage_id: `code-intent:${randomUUID()}`,
    },
    metadata: {
      module: "CODE_IDE",
      operation: "SEMANTIC_INTENT_ROUTER",
      latency_class: "realtime",
      owned_reasoning_only: true,
      external_fallback_allowed: false,
      mutation_authority: false,
      raw_reasoning_persisted: false,
    },
  }, { timeout_ms: 18000, poll_ms: 100 });

  const parsed = parseJson(text(execution?.output?.text ?? findText(execution?.output || execution), 5000)) || {};
  const allowed = new Set(["discussion", "design_preview", "image_generation", "architecture", "flow", "wireframe", "decision_board", "repository_work"]);
  const intent = allowed.has(text(parsed.intent, 80)) ? text(parsed.intent, 80) : "discussion";
  const confidence = Number.isFinite(Number(parsed.confidence)) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : 0.5;
  return {
    success: true,
    contract: CODE_AI_INTENT_ROUTER_CONTRACT,
    intent,
    confidence,
    reason: text(parsed.reason, 160) || null,
    provider: text(execution?.provider, 160) || null,
    raw_reasoning_returned: false,
  };
}

export async function createCodeAIDesignPreview({
  organizationId,
  partyId = null,
  message,
  recentConversation = [],
  workspace = {},
} = {}) {
  const userMessage = text(message, 5000);
  if (!organizationId) throw new Error("CODE_AI_DESIGN_PREVIEW_ORGANIZATION_REQUIRED");
  if (!userMessage) throw new Error("CODE_AI_DESIGN_PREVIEW_MESSAGE_REQUIRED");

  const repositoryUrl = text(workspace.repository_url, 1000) || null;
  const explicitMarketingSite = /\b(public\s+website|marketing\s+(?:site|page)|landing\s+page|homepage|company\s+website|brand\s+website)\b/i.test(userMessage);
  const domainWorkspacePage = /\b(finance|accounting|ledger|banking|reconciliation|invoice|payables?|receivables?|hotel operations?|front desk|restaurant operations?|pos|inventory|supply chain|construction operations?|project operations?|staff|hr|people|payroll|crm|sales operations?)\s+(?:page|screen|view|module|workspace)\b/i.test(userMessage);
  const experienceKind = /\b(customer|patient|staff|client)\s+portal\b|\bportal\b/i.test(userMessage)
    ? "portal"
    : (!explicitMarketingSite && domainWorkspacePage) || /\b(system|software|platform|dashboard|workspace|erp|crm|accounting system|finance system|operating system|back office|admin console)\b/i.test(userMessage)
      ? "product-system"
      : /\b(booking flow|checkout|onboarding|application flow|wizard)\b/i.test(userMessage)
        ? "transaction-flow"
        : "marketing-site";
  const conversation = compactConversation(recentConversation)
    .filter((turn) => text(turn?.content, 5000) !== userMessage)
    .slice(-2)
    .map((turn) => ({ ...turn, content: text(turn.content, 160) }));
  const designResearch = await researchDesignReferences({ organizationId, userMessage, experienceKind });
  const designResearchPrompt = text(designResearch?.prompt, 12000);
  const variationToken = randomUUID().slice(0, 8);
  const variationIndex = Number.parseInt(variationToken.slice(0, 2), 16) % 3;
  const shellOffset = Number.parseInt(variationToken.slice(2, 4), 16) % 5;
  const compactExperienceSynthesis = experienceKind !== "marketing-site";
  const masterInstructions = compactExperienceSynthesis ? [
    "Return ONE very compact JSON object. No prose/HTML/CSS/markdown.",
    "Top-level keys only: identity,selected,directions.",
    "identity keys only: industry,brand,eyebrow. brand empty unless user supplied it.",
    "selected is 0|1|2. directions is exactly 3 objects.",
    "Each direction keys only: name,why,shell,navigation,density,modules,nav_items,interaction,layout_graph,style,headline,subheadline,cta1,cta2.",
    "shell: sidebar|rail|topbar|split-pane|canvas. navigation: global|workspace|contextual|command. density: dense|balanced|airy.",
    "modules exactly 5 short labels. nav_items exactly 5 short labels.",
    "layout_graph exactly 5 nodes. Each node keys only: id,type,label,span,height,emphasis. type: metric|chart|table|queue|timeline|form|records|messages|action|status|calendar|document|workflow|summary|activity|filter|search|image|kanban|gantt|map|floorplan|matrix|scheduler|editor|inbox|command. span 1|2|3|4. height short|medium|tall. emphasis primary|secondary|quiet.",
    "style keys only: palette,typography,radius,surface,spacing,contrast. palette keys: background,surface,ink,accent,secondary; each value must include leading # plus 6 hex digits. typography: grotesk|humanist|serif|display|condensed|mono. radius: square|subtle|soft|pill. surface: flat|layered|glass|outlined|paper|solid. spacing: compact|balanced|spacious. contrast: low|medium|high.",
    "headline under 7 words; subheadline under 10; cta1 and cta2 under 4; why under 6.",
    `Experience: ${experienceKind}. Build working product/portal UI, never a marketing homepage.`,
    "Make the 3 graph topologies, framing, density, palette, typography and interaction materially different. No reskins.",
    "Use the external research across sources for patterns, but never copy one product or brand.",
    "No invented proof, certifications, clients, metrics, prices, guarantees or unsupported business facts.",
    `Variation ${variationToken}.`,
  ].join("\n") : [
    "Return ONE compact JSON object. No prose/HTML/CSS/markdown.",
    "Top-level keys only: identity,sections,selected,directions.",
    "identity keys: industry,family,business,audience,goal,brand,eyebrow. brand empty unless user supplied it.",
    "sections keys: trustline,services_title,services_intro,services,proof_title,proof_body,stats,closing_title,closing_body. services exactly 3 {title,body}; stats exactly 3 {value,label}.",
    "selected is 0|1|2. directions exactly 3 with keys name,why,hero,focus,color,image,shell,navigation,density,modules,nav_items,imagery_role,interaction,style,headline,subheadline,cta1,cta2.",
    "The three directions must differ materially in hero composition, palette, typography, density, imagery and interaction. Never make three reskins.",
    "style is {palette,typography,radius,surface,spacing,contrast}; palette has background,surface,ink,accent,secondary as #RRGGBB.",
    "Use public research across sources; never copy one site or brand. Do not default to Avantiqo cream/gold.",
    "Never invent proof, certifications, clients, metrics, prices, guarantees or unsupported business facts.",
    `Variation ${variationToken}.`,
  ].join("\n");

  void partyId;
  const sharedMessages = [
    ...(designResearchPrompt ? [{ role: "system", content: designResearchPrompt }] : []),
    ...conversation,
    { role: "user", content: userMessage },
  ];
  let masterExecution = null;
  try {
    masterExecution = await executeIntelligenceLocalQueueAndWait({
      capability: "ai.text.generate",
      execution_lane: "fast",
      messages: [{ role: "system", content: masterInstructions }, ...sharedMessages],
      temperature: 0.36,
      max_output_tokens: compactExperienceSynthesis ? 1200 : 1500,
      response_format: { type: "json_object" },
      front_task_mode: "code_deep_conversation",
      context: { organization_id: organizationId, usage_id: `code-design-synthesis:${randomUUID()}` },
      metadata: { module: "CODE_IDE", operation: "DESIGN_PREVIEW_SYNTHESIS", latency_class: "interactive", code_studio_interactive_preview: true, owned_reasoning_only: true, external_fallback_allowed: false, mutation_authority: false, raw_reasoning_persisted: false },
    }, { timeout_ms: 70000, poll_ms: 100 });
  } catch {
    masterExecution = null;
  }
  const masterText = text(masterExecution?.output?.text ?? findText(masterExecution?.output || masterExecution), 24000);
  const parsedMaster = parseJson(masterText) || {};
  const recoveredDirectionObjects = list(parsedMaster?.directions).length >= 3
    ? list(parsedMaster.directions).slice(0, 3)
    : recoverNamedJsonObjects(masterText, "name", 3);
  const masterCompact = { ...parsedMaster, directions: recoveredDirectionObjects };
  const identityCompact = masterCompact?.identity && typeof masterCompact.identity === "object" ? masterCompact.identity : {};
  const sectionCompact = masterCompact?.sections && typeof masterCompact.sections === "object" ? masterCompact.sections : {};
  const directionCompact = { selected: masterCompact?.selected, directions: list(masterCompact?.directions) };
  const identityExecution = masterExecution;
  const sectionExecution = masterExecution;
  const directionExecution = masterExecution;
  const parsedDirectionSeeds = list(directionCompact?.directions).slice(0, 3);
  const structuralDirectionSeeds = experienceKind === "product-system" ? [
    { name: "Command Center", why: "Live operational overview with decisive hierarchy", hero: "command-center", focus: "proof-led", color: "midnight-cobalt", image: "Subtle atmospheric product backdrop, no marketing hero", shell: "rail", navigation: "command", density: "dense", modules: ["cash position","receivables","ledger movement","attention queue"], imagery_role: "ambient", interaction: "monitor-and-act" },
    { name: "Ledger Workspace", why: "Dense professional workspace built for daily work", hero: "workspace", focus: "process-led", color: "polar-blue", image: "Quiet abstract financial texture, secondary to interface", shell: "sidebar", navigation: "workspace", density: "dense", modules: ["account ledger","journal entry","filters","period close"], imagery_role: "none", interaction: "edit-and-review" },
    { name: "Flow Canvas", why: "Spatial workflow for approvals and financial movement", hero: "flow-canvas", focus: "problem-led", color: "bold-retail", image: "Abstract data-flow atmosphere, no lifestyle advertising", shell: "canvas", navigation: "contextual", density: "balanced", modules: ["capture","validate","approve","post"], imagery_role: "none", interaction: "orchestrate-flow" },
  ] : experienceKind === "portal" ? [
    { name: "Portal Home", why: "Personal status and actions at a glance", hero: "portal-home", focus: "proof-led", color: "polar-blue", image: "Human healthcare image used as supporting context only", shell: "sidebar", navigation: "workspace", density: "balanced", modules: ["today","appointments","records","messages"], imagery_role: "supporting", interaction: "task-and-status" },
    { name: "Journey Workspace", why: "Timeline-led portal organized around progress", hero: "journey-workspace", focus: "process-led", color: "clinical-clean", image: "Calm documentary care photography, secondary to portal UI", shell: "split-pane", navigation: "contextual", density: "balanced", modules: ["care timeline","next action","documents","messages"], imagery_role: "contextual", interaction: "progressive-journey" },
    { name: "Service Hub", why: "Task-driven portal for records, messages and actions", hero: "service-hub", focus: "problem-led", color: "midnight-cobalt", image: "Minimal human care detail, interface remains primary", shell: "topbar", navigation: "command", density: "dense", modules: ["service queue","records","payments","support"], imagery_role: "minimal", interaction: "task-and-action" },
  ] : [
    { name: "Night Atlas", why: "Cinematic place-first storytelling", hero: "full-bleed", focus: "story-led", color: "midnight-cobalt", image: text(identityCompact?.hero_image, 180) || "Cinematic documentary place photography with small human scale" },
    { name: "Sunlit Field Notes", why: "Graphic magazine-like exploration", hero: "split", focus: "proof-led", color: "sunlit-yellow", image: text(identityCompact?.support_image, 180) || "Bright documentary detail with strong graphic composition" },
    { name: "Paper Journey", why: "Tactile editorial contrast", hero: "offset-editorial", focus: "gallery-led", color: "ink-red", image: "Editorial photography with tactile print sensibility" },
  ];
  const directionSeeds = parsedDirectionSeeds.length === 3 ? parsedDirectionSeeds : structuralDirectionSeeds;
  const directionExpansionInstructions = [
    "Return ONE compact JSON object for ONE digital experience direction. No prose/HTML/CSS/markdown.",
    "Keys only: headline,subheadline,cta1,cta2,trustline,services_title,services_intro,services,proof_title,proof_body,stats,closing_title,closing_body,image.",
    "services is exactly 3 objects with title and body. stats is exactly 3 objects with value and label.",
    "This copy must express the supplied direction specifically, not generic site copy. For systems/portals, use product/workflow language rather than marketing-page language. Supporting modules must differ across directions.",
    "headline under 8 words; subheadline under 12; service bodies under 10; trustline/proof/closing under 14; image under 14 words.",
    "stats must be qualitative labels only unless the user supplied verified numeric evidence.",
    "Never invent awards, testimonials, client counts, response times, guarantees, dates, prices, free offers, certifications, percentages or numeric proof.",
    "Do not invent operational facts, amenities, materials, sourcing, staff expertise, locations, views, food programs, wildlife, sustainability practices, or service features. Use concept language when facts are unknown.",
    "Never state that communities, local leaders, guides, experts, audits, measurements or certifications confirm/verify/prove impact or benefit without user-supplied evidence. Phrase sustainability and cultural themes as creative intent, not verified fact.",
    "Do not add keys beyond the exact schema.",
  ].join("\\n");
  const recipes = {
    "process-led": { section_rhythm: "story", shape_language: "minimal", typography_character: "humanist", section_sequence: ["hero","problems","process","image_story","proof","cta"], services_presentation: "timeline", proof_presentation: "image-story", cta_presentation: "quiet-footer", nav_style: "local-service" },
    "problem-led": { section_rhythm: "conversion-led", shape_language: "soft", typography_character: "geometric", section_sequence: ["hero","problems","services","proof","area","cta"], services_presentation: "problem-grid", proof_presentation: "transparency-panel", cta_presentation: "sticky-booking", nav_style: "conversion-heavy" },
    "story-led": { section_rhythm: "asymmetric", shape_language: "sharp", typography_character: "display", section_sequence: ["hero","image_story","services","trust","proof","cta"], services_presentation: "editorial-list", proof_presentation: "credential-led", cta_presentation: "bold-band", nav_style: "editorial" },
    "proof-led": { section_rhythm: "modular", shape_language: "technical", typography_character: "humanist", section_sequence: ["hero","proof","services","process","trust","cta"], services_presentation: "cards", proof_presentation: "stats-band", cta_presentation: "inline-card", nav_style: "minimal" },
    "gallery-led": { section_rhythm: "airy", shape_language: "organic", typography_character: "editorial-serif", section_sequence: ["hero","image_story","services","proof","faq","cta"], services_presentation: "image-led", proof_presentation: "image-story", cta_presentation: "quiet-footer", nav_style: "editorial" },
  };
  const focusPool = ["process-led","problem-led","story-led","proof-led","gallery-led"];
  const heroPool = experienceKind === "product-system"
    ? ["command-center","workspace","control-deck","review-workbench","flow-canvas"]
    : experienceKind === "portal"
      ? ["portal-home","journey-workspace","service-hub"]
      : experienceKind === "transaction-flow"
        ? ["guided-flow","stepper-workspace","decision-canvas"]
        : ["full-bleed","split","offset-editorial"];
  const colorPool = ["forest-natural","clinical-clean","industrial-neutral","warm-luxury","coastal-light","bold-retail","midnight-cobalt","sunlit-yellow","terracotta-paper","monochrome-editorial","ink-red","polar-blue"];
  const usedFocus = new Set();
  const usedHero = new Set();
  const usedColor = new Set();
  const usedShell = new Set();
  const baseSystemShells = ["sidebar","rail","topbar","split-pane","canvas"];
  const rotatedSystemShells = baseSystemShells.slice(shellOffset).concat(baseSystemShells.slice(0, shellOffset));
  const shellPool = experienceKind === "product-system"
    ? rotatedSystemShells
    : experienceKind === "portal"
      ? ["sidebar","split-pane","topbar","rail"]
      : ["topbar","split-pane","sidebar"];
  const validGraphTypes = new Set(["metric","chart","table","queue","timeline","form","records","message","messages","action","status","calendar","document","workflow","summary","activity","filter","search","image","kanban","gantt","map","floorplan","matrix","scheduler","editor","inbox","command"]);
  const normalizeLayoutGraph = (value, fallbackModules = []) => {
    const graphValue = Array.isArray(value)
      ? value
      : value && typeof value === "object" && Array.isArray(value.nodes)
        ? value.nodes
        : [];
    const source = graphValue.slice(0, 8);
    const normalized = source.map((node, index) => {
      const type = text(node?.type, 40).toLowerCase();
      const span = Math.max(1, Math.min(4, Number(node?.span) || (index === 0 ? 2 : 1)));
      const height = ["short","medium","tall"].includes(text(node?.height, 20).toLowerCase()) ? text(node?.height, 20).toLowerCase() : "medium";
      const emphasis = ["primary","secondary","quiet"].includes(text(node?.emphasis, 20).toLowerCase()) ? text(node?.emphasis, 20).toLowerCase() : (index === 0 ? "primary" : "secondary");
      return {
        id: text(node?.id, 60) || `region-${index + 1}`,
        type: type === "message" ? "messages" : validGraphTypes.has(type) ? type : "summary",
        label: text(node?.label, 80) || text(fallbackModules[index], 80) || `Region ${index + 1}`,
        span,
        height,
        emphasis,
      };
    }).filter((node) => node.label);
    if (normalized.length >= 5) return normalized;
    const fallbackTypes = ["metric","chart","table","queue","workflow","status","activity","summary"];
    const labels = [...fallbackModules, "Overview", "Activity", "Attention", "Workflow", "Status", "Records"].filter(Boolean);
    for (let index = normalized.length; index < 6; index += 1) {
      normalized.push({ id: `region-${index + 1}`, type: fallbackTypes[index % fallbackTypes.length], label: text(labels[index], 80) || `Region ${index + 1}`, span: index === 1 || index === 2 ? 2 : 1, height: index === 2 ? "tall" : "medium", emphasis: index === 0 ? "primary" : "secondary" });
    }
    return normalized.slice(0, 8);
  };
  const validHex = (value) => {
    const raw = text(value, 16).trim();
    const normalized = raw.startsWith("#") ? raw : `#${raw}`;
    return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : null;
  };
  const normalizeStyleDNA = (value = {}) => ({
    palette: {
      background: validHex(value?.palette?.background) || "#F3F5F7",
      surface: validHex(value?.palette?.surface) || "#FFFFFF",
      ink: validHex(value?.palette?.ink) || "#15191E",
      accent: validHex(value?.palette?.accent) || "#386B7A",
      secondary: validHex(value?.palette?.secondary) || "#7C8A91",
    },
    typography: ["grotesk","humanist","serif","display","condensed","mono"].includes(text(value?.typography, 30).toLowerCase()) ? text(value.typography, 30).toLowerCase() : "humanist",
    radius: ["square","subtle","soft","pill"].includes(text(value?.radius, 30).toLowerCase()) ? text(value.radius, 30).toLowerCase() : "subtle",
    surface: ["flat","layered","glass","outlined","paper","solid"].includes(text(value?.surface, 30).toLowerCase()) ? text(value.surface, 30).toLowerCase() : "layered",
    spacing: ["compact","balanced","spacious"].includes(text(value?.spacing, 30).toLowerCase()) ? text(value.spacing, 30).toLowerCase() : "balanced",
    contrast: ["low","medium","high"].includes(text(value?.contrast, 30).toLowerCase()) ? text(value.contrast, 30).toLowerCase() : "medium",
  });
  const rawDirections = directionSeeds.map((seed) => ({ ...seed }));
  let compactDirections = rawDirections.map((direction, index) => {
    let focus = text(direction?.focus, 80).toLowerCase();
    if (!recipes[focus] || usedFocus.has(focus)) focus = focusPool.find((value) => !usedFocus.has(value)) || focusPool[index % focusPool.length];
    usedFocus.add(focus);
    let hero = text(direction?.hero, 80).toLowerCase();
    if (!heroPool.includes(hero) || usedHero.has(hero)) hero = heroPool.find((value) => !usedHero.has(value)) || heroPool[index % heroPool.length];
    usedHero.add(hero);
    let color = text(direction?.color, 80).toLowerCase();
    if (!colorPool.includes(color) || usedColor.has(color)) color = colorPool.find((value) => !usedColor.has(value)) || colorPool[index % colorPool.length];
    usedColor.add(color);
    let shell = text(direction?.shell, 80).toLowerCase();
    if (experienceKind === "product-system") {
      shell = shellPool[index % shellPool.length];
    } else if (!shellPool.includes(shell) || (experienceKind === "portal" && usedShell.has(shell))) {
      shell = shellPool.find((value) => !usedShell.has(value)) || shellPool[index % shellPool.length];
    }
    usedShell.add(shell);
    if (experienceKind === "product-system") {
      const heroByShell = {
        sidebar: "workspace",
        rail: "command-center",
        topbar: "control-deck",
        "split-pane": "review-workbench",
        canvas: "flow-canvas",
      };
      hero = heroByShell[shell] || hero;
    }
    return {
      name: text(direction?.name, 80) || `Direction ${index + 1}`,
      rationale: text(direction?.why, 160),
      hero_layout: hero,
      color_direction: color,
      imagery_strategy: text(direction?.image, 160) || focus,
      headline: text(direction?.headline, 180) || text(identityCompact?.headline, 180),
      subheadline: text(direction?.subheadline, 280) || text(identityCompact?.subheadline, 280),
      primary_cta: text(direction?.cta1, 100) || text(identityCompact?.cta1, 100),
      secondary_cta: text(direction?.cta2, 100) || text(identityCompact?.cta2, 100),
      trust_line: text(direction?.trustline, 240) || text(sectionCompact?.trustline, 240),
      services_title: text(direction?.services_title, 180) || text(sectionCompact?.services_title, 180),
      services_intro: text(direction?.services_intro, 280) || text(sectionCompact?.services_intro, 280),
      services: (list(direction?.services).length === 3 ? list(direction?.services) : list(sectionCompact?.services)).slice(0, 3).map((service) => ({
        title: text(service?.title, 90),
        body: text(service?.body, 220),
      })),
      proof_title: text(direction?.proof_title, 180) || text(sectionCompact?.proof_title, 180),
      proof_body: text(direction?.proof_body, 280) || text(sectionCompact?.proof_body, 280),
      stats: (list(direction?.stats).length === 3 ? list(direction?.stats) : list(sectionCompact?.stats)).slice(0, 3).map((stat) => ({
        value: text(stat?.value, 80),
        label: text(stat?.label, 140),
      })),
      closing_title: text(direction?.closing_title, 180) || text(sectionCompact?.closing_title, 180),
      closing_body: text(direction?.closing_body, 280) || text(sectionCompact?.closing_body, 280),
      hero_image_brief: text(direction?.image, 220),
      composition_shell: shell,
      navigation_mode: ["global","workspace","contextual","command"].includes(text(direction?.navigation, 80).toLowerCase()) ? text(direction?.navigation, 80).toLowerCase() : null,
      information_density: ["dense","balanced","airy"].includes(text(direction?.density, 80).toLowerCase()) ? text(direction?.density, 80).toLowerCase() : null,
      module_sequence: list(direction?.modules).map((value) => text(value, 80)).filter(Boolean).slice(0, 6),
      navigation_items: list(direction?.nav_items).map((value) => text(value, 50)).filter(Boolean).slice(0, 7),
      layout_graph: normalizeLayoutGraph(direction?.layout_graph, list(direction?.modules).map((value) => text(value, 80)).filter(Boolean)),
      style_dna: normalizeStyleDNA(direction?.style),
      imagery_role: text(direction?.imagery_role, 80) || null,
      interaction_pattern: text(direction?.interaction, 100) || null,
      ...recipes[focus],
    };
  });
  const expressivePalettePool = ["midnight-cobalt","sunlit-yellow","terracotta-paper","monochrome-editorial","ink-red","polar-blue"];
  const mutedPaletteSet = new Set(["forest-natural","clinical-clean","industrial-neutral","warm-luxury","coastal-light"]);
  if (compactDirections.length === 3 && compactDirections.every((direction) => mutedPaletteSet.has(direction.color_direction))) {
    compactDirections[1] = { ...compactDirections[1], color_direction: expressivePalettePool[variationIndex % expressivePalettePool.length] };
  }
  if (compactDirections.length === 3 && compactDirections[0].nav_style === compactDirections[1].nav_style && compactDirections[1].nav_style === compactDirections[2].nav_style) {
    compactDirections[0] = { ...compactDirections[0], nav_style: "editorial" };
    compactDirections[1] = { ...compactDirections[1], nav_style: "minimal" };
    compactDirections[2] = { ...compactDirections[2], nav_style: "conversion-heavy" };
  }
  const genericCopyPattern = /\b(an experience shaped|what (?:the )?experience is built around|why this experience works|clear information|relevant detail|direct next step|designed around the experience|details handled with care|simple next steps|sustainable practices|impact audits?|ecosystem integrity protocols?|community co-ownership|travel that validates|travel that breathes)\b/i;
  const unsupportedImpactPattern = /\b(certif(?:y|ied|ication)|audit(?:ed|s)?|measur(?:e|ed|ement)|validat(?:e|ed|ion)|accredit(?:ed|ation)|verified|proven|guarantee(?:d)?|testimonials?|real travelers?|traveler stories?|what travelers say|local leaders?|local voices?|communities?|community partners?|community stewardship|guides?|experts?|elders?|architects?|ecologists?|residents?)\b|\b(local leaders?|communities?|community partners?|guides?|experts?)\b.{0,48}\b(confirm|verify|prove|ensure|support|measure|validate)\b/i;
  const directionQualityIssues = (direction = {}) => {
    const chunks = [
      direction.headline, direction.subheadline, direction.trust_line, direction.services_title,
      direction.services_intro, direction.proof_title, direction.proof_body,
      direction.closing_title, direction.closing_body,
      ...list(direction.services).flatMap((item) => [item?.title, item?.body]),
      ...list(direction.stats).flatMap((item) => [item?.value, item?.label]),
    ].map((value) => text(value, 320)).filter(Boolean);
    const joined = chunks.join(" | ");
    const issues = [];
    if (genericCopyPattern.test(joined)) issues.push("generic_or_template_copy");
    if (experienceKind === "marketing-site" && unsupportedImpactPattern.test(joined)) issues.push("unsupported_impact_claim");
    if (!text(direction.headline, 180) || !text(direction.subheadline, 280)) issues.push("missing_hero_copy");
    if (experienceKind === "marketing-site" && list(direction.services).filter((item) => text(item?.title, 90) && text(item?.body, 220)).length !== 3) issues.push("incomplete_services");
    return issues;
  };
  const initialQualityIssues = compactDirections.map(directionQualityIssues);
  const repairIndices = initialQualityIssues.map((issues, index) => issues.length ? index : -1).filter((index) => index >= 0);
  if (experienceKind === "marketing-site" && repairIndices.length) {
    const repairInstructions = [
      "Return ONE compact JSON object with keys headline,subheadline,cta1,cta2,trustline,services_title,services_intro,services,proof_title,proof_body,stats,closing_title,closing_body,image. services exactly 3 {title,body}; stats exactly 3 {value,label}.",
      "This is a bounded quality repair of an existing direction. Preserve its structural identity, but replace weak copy.",
      "Reject generic template phrases. Every headline, service, proof section and closing must feel native to this exact industry and creative direction.",
      "Do not invent certifications, audits, measurements, validation, testimonials, traveler quotes, local voices, guides, experts, architects, ecologists, community participation, ecological proof, guarantees, or operational facts.",
      "Use evocative but non-factual language when evidence is unavailable. Return the same exact JSON keys as the original direction schema.",
    ].join("\\n");
    const repairedSettled = await Promise.allSettled(repairIndices.map((index) => executeIntelligenceLocalQueueAndWait({
      capability: "ai.text.generate",
      execution_lane: "fast",
      messages: [
        { role: "system", content: repairInstructions },
        { role: "user", content: JSON.stringify({ request: text(userMessage, 500), issues: initialQualityIssues[index], direction: compactDirections[index] }) },
      ],
      temperature: 0.28,
      max_output_tokens: 620,
      response_format: { type: "json_object" },
      front_task_mode: "code_deep_conversation",
      context: { organization_id: organizationId, usage_id: `code-design-quality-repair:${index}:${randomUUID()}` },
      metadata: { module: "CODE_IDE", operation: "DESIGN_PREVIEW_QUALITY_REPAIR", latency_class: "interactive", code_studio_interactive_preview: true, owned_reasoning_only: true, external_fallback_allowed: false, mutation_authority: false, raw_reasoning_persisted: false },
    }, { timeout_ms: 75000, poll_ms: 100 })));
    repairedSettled.forEach((settled, repairPosition) => {
      if (settled.status !== "fulfilled") return;
      const index = repairIndices[repairPosition];
      const repaired = parseJson(text(settled.value?.output?.text ?? findText(settled.value?.output || settled.value), 10000));
      if (!repaired || typeof repaired !== "object") return;
      const current = compactDirections[index];
      const candidateRepair = {
        ...current,
        headline: text(repaired.headline, 180) || current.headline,
        subheadline: text(repaired.subheadline, 280) || current.subheadline,
        primary_cta: text(repaired.cta1, 100) || current.primary_cta,
        secondary_cta: text(repaired.cta2, 100) || current.secondary_cta,
        trust_line: text(repaired.trustline, 240) || current.trust_line,
        services_title: text(repaired.services_title, 180) || current.services_title,
        services_intro: text(repaired.services_intro, 280) || current.services_intro,
        services: list(repaired.services).slice(0, 3).map((service) => ({ title: text(service?.title, 90), body: text(service?.body, 220) })),
        proof_title: text(repaired.proof_title, 180) || current.proof_title,
        proof_body: text(repaired.proof_body, 280) || current.proof_body,
        stats: list(repaired.stats).slice(0, 3).map((stat) => ({ value: text(stat?.value, 80), label: text(stat?.label, 140) })),
        closing_title: text(repaired.closing_title, 180) || current.closing_title,
        closing_body: text(repaired.closing_body, 280) || current.closing_body,
        hero_image_brief: text(repaired.image, 220) || current.hero_image_brief,
      };
      if (directionQualityIssues(candidateRepair).length === 0) compactDirections[index] = candidateRepair;
    });
  }
  const designQualityIssues = compactDirections.map(directionQualityIssues);
  const designQualityPassed = designQualityIssues.every((issues) => issues.length === 0);

  const parsed = identityCompact && typeof identityCompact === "object" ? {
    industry: text(identityCompact.industry, 120),
    experience_kind: experienceKind,
    design_family: text(identityCompact.family, 120),
    business_model: text(identityCompact.business, 120),
    customer_type: text(identityCompact.audience, 180),
    conversion_goal: text(identityCompact.goal, 120),
    urgency: text(identityCompact.urgency, 80),
    trust_mode: text(identityCompact.trust, 120),
    visual_personality: list(identityCompact.personality).map((value) => text(value, 60)).filter(Boolean).slice(0, 5),
    variant: text(identityCompact.variant, 80),
    brand_name: text(identityCompact.brand, 120),
    eyebrow: text(identityCompact.eyebrow, 180),
    headline: text(identityCompact.headline, 220),
    subheadline: text(identityCompact.subheadline, 420),
    primary_cta: text(identityCompact.cta1, 120),
    secondary_cta: text(identityCompact.cta2, 120),
    hero_image_brief: text(identityCompact.hero_image, 420),
    support_image_brief: text(identityCompact.support_image, 420),
    trust_line: text(sectionCompact?.trustline, 360),
    services_title: text(sectionCompact?.services_title, 220),
    services_intro: text(sectionCompact?.services_intro, 420),
    services: list(sectionCompact?.services).slice(0, 3),
    proof_title: text(sectionCompact?.proof_title, 220),
    proof_body: text(sectionCompact?.proof_body, 420),
    stats: list(sectionCompact?.stats).slice(0, 3),
    closing_title: text(sectionCompact?.closing_title, 220),
    closing_body: text(sectionCompact?.closing_body, 420),
    selected_direction: Number.isFinite(Number(directionCompact?.selected)) ? Number(directionCompact.selected) : variationIndex,
    design_directions: compactDirections,
    research_sources: list(designResearch?.sources).slice(0, 5),
  } : {
    experience_kind: experienceKind,
    research_sources: list(designResearch?.sources).slice(0, 5),
    selected_direction: Number.isFinite(Number(directionCompact?.selected)) ? Number(directionCompact.selected) : variationIndex,
    design_directions: compactDirections,
  };
  const dynamicSchemaComplete = Boolean(compactDirections.length === 3 && compactDirections.every((direction) =>
    text(direction?.name, 120) &&
    text(direction?.hero_layout, 80) &&
    text(direction?.section_rhythm, 80) &&
    text(direction?.typography_character, 80) &&
    text(direction?.color_direction, 80) &&
    text(direction?.imagery_strategy, 120) &&
    text(direction?.headline, 180) &&
    text(direction?.subheadline, 280) &&
    (experienceKind !== "marketing-site" || list(direction?.services).filter((item) => text(item?.title, 90) && text(item?.body, 220)).length === 3) &&
    (experienceKind === "marketing-site" || (
      text(direction?.composition_shell, 80) &&
      text(direction?.navigation_mode, 80) &&
      text(direction?.information_density, 80) &&
      list(direction?.module_sequence).filter((item) => text(item, 80)).length >= 3 &&
      list(direction?.layout_graph).filter((node) => text(node?.type, 40) && text(node?.label, 80)).length >= 5
    ))
  ));
  const fieldServiceRequested = /\b(pest\s*control|exterminat|termite|cockroach|rodent|mosquito|plumb|hvac|cleaning|landscap|maintenance|field service)\b/i.test(userMessage);
  const genericIndustry = /\b(sustainable\s+tourism|eco\s*tourism|ecotourism|responsible\s+travel|travel|tourism|destination|tour\s+operator)\b/i.test(userMessage)
    ? "travel_experience"
    : /\b(eco\s*lodge|lodge|hotel|resort|hospitality|pms|front desk)\b/i.test(userMessage)
      ? "hospitality"
      : /\b(hospital|health|patient|clinic|medical|healthcare)\b/i.test(userMessage)
        ? "healthcare"
        : /\b(construction|contractor|jobsite|site team|project manager|rfi|subcontractor)\b/i.test(userMessage)
          ? "construction"
          : /\b(retail|store|commerce|merchandise|pos)\b/i.test(userMessage)
            ? "retail"
            : /\b(account|finance|tax|advis|legal|consult)/i.test(userMessage)
              ? "professional_service"
              : /\b(restaurant|cafe|bar|food|beverage)/i.test(userMessage)
                ? "food_beverage"
                : "generic";
  const productFallbackProfiles = {
    hospitality: {
      industry: "hospitality_operations", brand: "Hotel Operations", eyebrow: "Arrivals · Rooms · Service", headline: "Run the property from one live surface.", subheadline: "Front desk, rooms, guests and handovers stay visible together.", primary: "Open arrivals", secondary: "View handover",
      directions: [
        { name: "Arrival Command", rationale: "Live arrivals, rooms and attention queues.", shell: "rail", nav: "command", density: "dense", modules: ["arrivals","room status","guest requests","handover queue","occupancy"], navItems: ["Pulse","Arrivals","Rooms","Guests","Handover"] },
        { name: "Front Desk Workbench", rationale: "Working surface for check-in and stay operations.", shell: "split-pane", nav: "workspace", density: "balanced", modules: ["arrival list","room assignment","guest profile","payments","messages"], navItems: ["Desk","Arrivals","Stays","Payments","Messages"] },
        { name: "Stay Flow", rationale: "Guest journey and service orchestration.", shell: "canvas", nav: "contextual", density: "airy", modules: ["pre-arrival","check-in","in-stay requests","service recovery","departure"], navItems: ["Journey","Requests","Tasks","Recovery","History"] },
      ],
    },
    healthcare: {
      industry: "healthcare_operations", brand: "Care Operations", eyebrow: "Patients · Tasks · Records", headline: "Care coordination without losing the patient.", subheadline: "Status, records, tasks and handoffs stay connected in one workspace.", primary: "Open queue", secondary: "View records",
      directions: [
        { name: "Care Command", rationale: "Live patient state with clear exceptions.", shell: "rail", nav: "command", density: "dense", modules: ["patient status","care queue","handoffs","alerts","capacity"], navItems: ["Pulse","Patients","Queues","Handoffs","Capacity"] },
        { name: "Clinical Workspace", rationale: "Focused working surface for daily coordination.", shell: "split-pane", nav: "workspace", density: "balanced", modules: ["patient list","care plan","orders","documents","messages"], navItems: ["Patients","Plans","Orders","Records","Messages"] },
        { name: "Care Journey", rationale: "Timeline-led coordination across the patient journey.", shell: "canvas", nav: "contextual", density: "airy", modules: ["intake","assessment","treatment","follow-up","discharge"], navItems: ["Journey","Tasks","Team","Evidence","History"] },
      ],
    },
    construction: {
      industry: "construction_operations", brand: "Project Operations", eyebrow: "Sites · Work · Risk", headline: "See the jobsite before it becomes a problem.", subheadline: "Progress, RFIs, crews, documents and risks stay in one operational view.", primary: "Open site", secondary: "Review risks",
      directions: [
        { name: "Site Command", rationale: "Live project state with field attention queues.", shell: "rail", nav: "command", density: "dense", modules: ["site progress","crew status","open RFIs","safety queue","schedule risk"], navItems: ["Pulse","Sites","RFIs","Crews","Risks"] },
        { name: "Project Workbench", rationale: "Daily control surface for project managers.", shell: "split-pane", nav: "workspace", density: "balanced", modules: ["lookahead plan","submittals","documents","cost changes","tasks"], navItems: ["Project","Plan","RFIs","Docs","Costs"] },
        { name: "Build Flow", rationale: "Spatial workflow from issue to resolution.", shell: "canvas", nav: "contextual", density: "airy", modules: ["capture issue","assign owner","review evidence","approve change","close item"], navItems: ["Flow","Issues","Approvals","Evidence","History"] },
      ],
    },
    retail: {
      industry: "retail_operations", brand: "Retail Operations", eyebrow: "Stores · Stock · Sales", headline: "Operate every store from the signals that matter.", subheadline: "Sales, stock, staff and exceptions stay visible in one system.", primary: "Open stores", secondary: "Review stock",
      directions: [
        { name: "Store Command", rationale: "Live network state across stores and stock.", shell: "rail", nav: "command", density: "dense", modules: ["store performance","stock risk","staff coverage","returns queue","alerts"], navItems: ["Pulse","Stores","Stock","Staff","Alerts"] },
        { name: "Retail Workbench", rationale: "Working surface for store and inventory teams.", shell: "split-pane", nav: "workspace", density: "balanced", modules: ["sales activity","inventory","transfers","orders","tasks"], navItems: ["Stores","Inventory","Orders","Transfers","Tasks"] },
        { name: "Merch Flow", rationale: "Operational flow from stock signal to action.", shell: "canvas", nav: "contextual", density: "airy", modules: ["detect demand","rebalance stock","approve transfer","receive goods","verify floor"], navItems: ["Flow","Demand","Transfers","Receiving","History"] },
      ],
    },
    food_beverage: {
      industry: "restaurant_operations", brand: "Restaurant Operations", eyebrow: "Service · Orders · Kitchen", headline: "Run service from one operational pulse.", subheadline: "Tables, orders, kitchen flow and staff attention stay connected.", primary: "Open service", secondary: "View kitchen",
      directions: [
        { name: "Service Command", rationale: "Live floor, kitchen and attention state.", shell: "rail", nav: "command", density: "dense", modules: ["active tables","order flow","kitchen queue","staff coverage","service alerts"], navItems: ["Pulse","Tables","Orders","Kitchen","Staff"] },
        { name: "Floor Workbench", rationale: "Daily operating surface for managers and service teams.", shell: "split-pane", nav: "workspace", density: "balanced", modules: ["table map","open orders","guest notes","payments","handover"], navItems: ["Floor","Orders","Guests","Payments","Handover"] },
        { name: "Service Flow", rationale: "Journey from seating to payment and recovery.", shell: "canvas", nav: "contextual", density: "airy", modules: ["seat guests","take order","fire kitchen","serve","close table"], navItems: ["Flow","Tables","Kitchen","Recovery","History"] },
      ],
    },
    professional_service: {
      industry: "finance_operations", brand: "Finance Workspace", eyebrow: "Operate · Reconcile · Close", headline: "Finance work, visibly under control.", subheadline: "A working system for accounting teams, not a marketing page.", primary: "New action", secondary: "Review queue",
      directions: [
        { name: "Command Ledger", rationale: "Live financial state with action queues.", shell: "rail", nav: "command", density: "dense", modules: ["cash position","receivables","ledger movement","attention queue","close status"], navItems: ["Pulse","Accounts","Banking","Receivables","Close"] },
        { name: "Working Ledger", rationale: "Dense accounting workspace for daily execution.", shell: "split-pane", nav: "workspace", density: "balanced", modules: ["account ledger","journal entry","reconciliation","period close","documents"], navItems: ["Workspace","Journal","Reconcile","Documents","Reports"] },
        { name: "Finance Flow", rationale: "Spatial workflow for movement and approvals.", shell: "canvas", nav: "contextual", density: "airy", modules: ["capture","validate","approval queue","post to ledger","evidence"], navItems: ["Flow","Exceptions","Approvals","Evidence","History"] },
      ],
    },
  };
  const productFallbackProfile = productFallbackProfiles[genericIndustry] || {
    industry: "operations", brand: "Operations Workspace", eyebrow: "Work · State · Action", headline: "See the operation. Act on what matters.", subheadline: "A working system built around live state, ownership and next actions.", primary: "Open workspace", secondary: "View activity",
    directions: [
      { name: "Command Surface", rationale: "Live state and attention in one place.", shell: "rail", nav: "command", density: "dense", modules: ["current state","attention queue","activity","capacity","alerts"], navItems: ["Pulse","Work","Queue","Activity","Alerts"] },
      { name: "Working Surface", rationale: "Focused workspace for daily execution.", shell: "split-pane", nav: "workspace", density: "balanced", modules: ["work queue","records","tasks","documents","messages"], navItems: ["Workspace","Tasks","Records","Docs","Messages"] },
      { name: "Operational Flow", rationale: "Spatial flow from signal to verified outcome.", shell: "canvas", nav: "contextual", density: "airy", modules: ["capture","review","assign","execute","verify"], navItems: ["Flow","Work","Approvals","Evidence","History"] },
    ],
  };
  const productSystemFallback = {
    industry: productFallbackProfile.industry,
    experience_kind: "product-system",
    design_family: "operational-product",
    business_model: "software-platform",
    customer_type: "professional operators",
    conversion_goal: "operate",
    urgency: "working-session",
    trust_mode: "clarity and control",
    visual_personality: ["precise", "operational", "calm", "high-signal"],
    design_directions: productFallbackProfile.directions.map((direction, index) => ({
      name: direction.name,
      rationale: direction.rationale,
      hero_layout: ["command-center","workspace","flow-canvas"][index],
      section_rhythm: ["modular","conversion-led","asymmetric"][index],
      shape_language: ["technical","minimal","sharp"][index],
      typography_character: ["humanist","geometric","display"][index],
      color_direction: ["midnight-cobalt","polar-blue","bold-retail"][index],
      imagery_strategy: ["interface-primary","interface-only","data-flow"][index],
      section_sequence: direction.modules,
      services_presentation: ["cards","timeline","editorial-list"][index],
      proof_presentation: ["stats-band","transparency-panel","image-story"][index],
      cta_presentation: ["inline-card","sticky-booking","bold-band"][index],
      nav_style: ["minimal","local-service","editorial"][index],
      composition_shell: direction.shell,
      navigation_mode: direction.nav,
      information_density: direction.density,
      module_sequence: direction.modules,
      navigation_items: direction.navItems,
      imagery_role: "none",
      interaction_pattern: ["monitor-and-act","edit-and-review","orchestrate-flow"][index],
      headline: [productFallbackProfile.headline, productFallbackProfile.headline, productFallbackProfile.headline][index],
      subheadline: productFallbackProfile.subheadline,
      primary_cta: productFallbackProfile.primary,
      secondary_cta: productFallbackProfile.secondary,
    })),
    selected_direction: variationIndex,
    variant: "executive-modern",
    brand_name: productFallbackProfile.brand,
    eyebrow: productFallbackProfile.eyebrow,
    headline: productFallbackProfile.headline,
    subheadline: productFallbackProfile.subheadline,
    primary_cta: productFallbackProfile.primary,
    secondary_cta: productFallbackProfile.secondary,
    trust_line: "Live state, clear ownership and traceable financial work.",
    services_title: "Daily finance operations",
    services_intro: "Work through ledger, banking, receivables and close from one system.",
    services: [
      { title: "Ledger", body: "Review postings, journals and account movement." },
      { title: "Reconcile", body: "Match bank activity and resolve exceptions." },
      { title: "Close", body: "Track period tasks, reviews and posting readiness." },
    ],
    proof_title: "Operational evidence stays visible.",
    proof_body: "Surface balances, exceptions, approvals and workflow state directly in context.",
    stats: [
      { value: "Live", label: "Current operating state" },
      { value: "Traceable", label: "Clear work history" },
      { value: "Focused", label: "Exceptions before noise" },
    ],
    closing_title: "Keep the work moving.",
    closing_body: "Move from signal to action without leaving the workspace.",
    hero_image_brief: "",
    support_image_brief: "",
  };
  const portalFallback = {
    industry: genericIndustry,
    experience_kind: "portal",
    design_family: "authenticated-portal",
    business_model: "service-portal",
    customer_type: "authenticated customers",
    conversion_goal: "self-service",
    urgency: "task-driven",
    trust_mode: "clarity and privacy",
    visual_personality: ["calm", "human", "clear", "actionable"],
    design_directions: [
      { name: "Portal Home", rationale: "Personal status and actions at a glance.", hero_layout: "portal-home", section_rhythm: "modular", shape_language: "soft", typography_character: "humanist", color_direction: "polar-blue", imagery_strategy: "interface-primary", section_sequence: ["today","tasks","records","messages"], services_presentation: "cards", proof_presentation: "stats-band", cta_presentation: "inline-card", nav_style: "minimal", composition_shell: "sidebar", navigation_mode: "workspace", information_density: "balanced", module_sequence: ["today","appointments","records","messages"], imagery_role: "supporting", interaction_pattern: "task-and-status" },
      { name: "Journey Workspace", rationale: "Progress-led portal around the user's journey.", hero_layout: "journey-workspace", section_rhythm: "story", shape_language: "minimal", typography_character: "geometric", color_direction: "clinical-clean", imagery_strategy: "contextual-human", section_sequence: ["timeline","next-action","documents","support"], services_presentation: "timeline", proof_presentation: "transparency-panel", cta_presentation: "quiet-footer", nav_style: "local-service", composition_shell: "split-pane", navigation_mode: "contextual", information_density: "balanced", module_sequence: ["care timeline","next action","documents","messages"], imagery_role: "contextual", interaction_pattern: "progressive-journey" },
      { name: "Service Hub", rationale: "High-signal tasks, records and service actions.", hero_layout: "service-hub", section_rhythm: "asymmetric", shape_language: "technical", typography_character: "display", color_direction: "midnight-cobalt", imagery_strategy: "minimal-human", section_sequence: ["queue","records","payments","support"], services_presentation: "problem-grid", proof_presentation: "credential-led", cta_presentation: "bold-band", nav_style: "conversion-heavy", composition_shell: "topbar", navigation_mode: "command", information_density: "dense", module_sequence: ["service queue","records","payments","support"], imagery_role: "minimal", interaction_pattern: "task-and-action" },
    ],
    selected_direction: variationIndex,
    variant: "executive-modern",
    brand_name: "Customer Portal",
    eyebrow: "Status · Records · Actions",
    headline: "Everything you need, in one place.",
    subheadline: "A secure working portal for status, records, messages and next actions.",
    primary_cta: "Open task",
    secondary_cta: "View records",
    trust_line: "Clear status and relevant actions without marketing noise.",
    services_title: "Your workspace",
    services_intro: "See what matters now and move directly to the next action.",
    services: [
      { title: "Today", body: "Current tasks and upcoming actions." },
      { title: "Records", body: "Documents and history in context." },
      { title: "Messages", body: "Conversations tied to the work." },
    ],
    proof_title: "Context stays with the task.",
    proof_body: "Keep records, status and communication connected to the action at hand.",
    stats: [
      { value: "Current", label: "Relevant status first" },
      { value: "Connected", label: "Records with context" },
      { value: "Actionable", label: "Clear next steps" },
    ],
    closing_title: "Continue where you left off.",
    closing_body: "Return directly to the work that needs attention.",
    hero_image_brief: "",
    support_image_brief: "",
  };
  const fallback = experienceKind === "product-system" ? productSystemFallback : experienceKind === "portal" ? portalFallback : fieldServiceRequested ? {
    industry: /\b(pest\s*control|exterminat|termite|cockroach|rodent|mosquito)\b/i.test(userMessage) ? "pest_control" : "field_service",
    design_family: "field-service",
    business_model: "local-service",
    customer_type: "homeowners and local businesses",
    conversion_goal: "book",
    urgency: "high",
    trust_mode: "safety and local-proof",
    visual_personality: ["practical", "human", "clean", "confident"],
    hero_layout: variationIndex === 0 ? "full-bleed" : variationIndex === 1 ? "split" : "offset-editorial",
    section_rhythm: variationIndex === 0 ? "story" : variationIndex === 1 ? "conversion-led" : "asymmetric",
    shape_language: variationIndex === 2 ? "sharp" : "minimal",
    typography_character: variationIndex === 2 ? "display" : "humanist",
    color_direction: variationIndex === 0 ? "forest-natural" : variationIndex === 1 ? "clinical-clean" : "industrial-neutral",
    imagery_strategy: variationIndex === 0 ? "technician-in-context" : variationIndex === 1 ? "process-detail" : "people-and-place",
    design_directions: [
      { name: "Documentary Service", rationale: "Lead with real technician activity and a strong local-service feel.", hero_layout: "full-bleed", section_rhythm: "story", shape_language: "minimal", typography_character: "humanist", color_direction: "forest-natural", imagery_strategy: "technician-in-context", section_sequence: ["hero","problems","process","image_story","proof","cta"], services_presentation: "timeline", proof_presentation: "image-story", cta_presentation: "quiet-footer", nav_style: "local-service" },
      { name: "Conversion First", rationale: "Clear split hero, immediate booking action, problem-first service flow.", hero_layout: "split", section_rhythm: "conversion-led", shape_language: "soft", typography_character: "geometric", color_direction: "clinical-clean", imagery_strategy: "process-detail", section_sequence: ["hero","problems","services","proof","service_area","cta"], services_presentation: "problem-grid", proof_presentation: "transparency-panel", cta_presentation: "sticky-booking", nav_style: "conversion-heavy" },
      { name: "Local Editorial", rationale: "More distinctive composition with bolder type and asymmetric photography.", hero_layout: "offset-editorial", section_rhythm: "asymmetric", shape_language: "sharp", typography_character: "display", color_direction: "industrial-neutral", imagery_strategy: "people-and-place", section_sequence: ["hero","image_story","services","trust","proof","cta"], services_presentation: "editorial-list", proof_presentation: "credential-led", cta_presentation: "bold-band", nav_style: "editorial" },
    ],
    selected_direction: variationIndex,
    variant: "executive-modern",
    brand_name: "Pest Control",
    eyebrow: "Inspection · Treatment · Prevention",
    headline: "Protect the spaces you live and work in.",
    subheadline: "Fast assessment, targeted treatment and practical prevention from a professional local service team.",
    primary_cta: "Book an inspection",
    secondary_cta: "See our services",
    trust_line: "Clear advice, practical treatment plans and reliable follow-up without unnecessary complexity.",
    services_title: "Solve the problem. Prevent the return.",
    services_intro: "A simple process built around inspection, the right treatment for the situation, and practical prevention.",
    services: [
      { title: "Inspect", body: "Find the source, entry points and conditions driving the problem before treatment begins." },
      { title: "Treat", body: "Use a targeted plan suited to the property, pest pressure and level of activity." },
      { title: "Prevent", body: "Close the loop with follow-up guidance and practical steps that reduce recurrence." },
    ],
    proof_title: "A service experience built around clarity.",
    proof_body: "You should know what was found, what is being treated, what happens next and how to reduce the chance of the problem returning.",
    stats: [
      { value: "Inspect", label: "Understand the source" },
      { value: "Treat", label: "Target the problem" },
      { value: "Prevent", label: "Reduce recurrence" },
    ],
    closing_title: "Need help with a pest problem?",
    closing_body: "Start with an inspection and a clear plan for the property.",
    hero_image_brief: "Commercial lifestyle photograph of a professional pest control technician inspecting the exterior perimeter of a real home in daylight, discreet professional uniform without logos, practical equipment, believable service moment, clean modern photography, no text, no typography, no watermark.",
    support_image_brief: "Commercial close-up photograph of a pest control technician inspecting a hidden entry point near a wall or cabinet using a flashlight and inspection tool, clean professional scene, no insects enlarged, no logos, no text, no watermark.",
  } : {
    industry: genericIndustry,
    design_family: genericIndustry === "travel_experience" ? "destination-experience" : genericIndustry === "hospitality" ? "hospitality-experience" : genericIndustry === "food_beverage" ? "food-beverage" : genericIndustry === "professional_service" ? "editorial-professional" : "generic-modern",
    business_model: genericIndustry === "travel_experience" ? "experience-operator" : genericIndustry === "hospitality" ? "venue" : genericIndustry === "food_beverage" ? "venue" : genericIndustry === "professional_service" ? "professional-service" : "service",
    customer_type: genericIndustry === "travel_experience" ? "responsible travelers" : genericIndustry === "hospitality" ? "guests and travelers" : genericIndustry === "food_beverage" ? "diners and local customers" : "customers",
    conversion_goal: genericIndustry === "travel_experience" ? "explore" : genericIndustry === "hospitality" ? "reserve" : genericIndustry === "food_beverage" ? "visit" : "contact",
    urgency: "low",
    trust_mode: "experience and clarity",
    visual_personality: genericIndustry === "travel_experience" ? ["immersive", "editorial", "earthy", "human"] : genericIndustry === "hospitality" ? ["immersive", "calm", "sensory", "distinctive"] : ["clear", "specific", "modern", "credible"],
    hero_layout: variationIndex === 0 ? "full-bleed" : variationIndex === 1 ? "split" : "offset-editorial",
    section_rhythm: variationIndex === 0 ? "story" : variationIndex === 1 ? "modular" : "asymmetric",
    shape_language: variationIndex === 0 ? "organic" : variationIndex === 1 ? "minimal" : "sharp",
    typography_character: variationIndex === 0 ? "editorial-serif" : variationIndex === 1 ? "humanist" : "display",
    color_direction: variationIndex === 0 ? "forest-natural" : variationIndex === 1 ? "coastal-light" : "industrial-neutral",
    imagery_strategy: variationIndex === 0 ? "people-and-place" : variationIndex === 1 ? "architecture" : "process-detail",
    design_directions: [
      { name: "Night Atlas", rationale: "Cinematic, immersive and photography-first.", hero_layout: "full-bleed", section_rhythm: "story", shape_language: "sharp", typography_character: "display", color_direction: "midnight-cobalt", imagery_strategy: "cinematic-place-and-human-scale", section_sequence: ["hero","image_story","journal_strip","services","cta"], services_presentation: "editorial-list", proof_presentation: "image-story", cta_presentation: "bold-band", nav_style: "editorial" },
      { name: "Sunlit Field Notes", rationale: "Bright, graphic and magazine-like.", hero_layout: "split", section_rhythm: "modular", shape_language: "minimal", typography_character: "geometric", color_direction: "sunlit-yellow", imagery_strategy: "documentary-detail-and-place", section_sequence: ["hero","field_notes","services","image_grid","cta"], services_presentation: "cards", proof_presentation: "stats-band", cta_presentation: "inline-card", nav_style: "minimal" },
      { name: "Paper Journey", rationale: "Editorial, tactile and deliberately quiet.", hero_layout: "offset-editorial", section_rhythm: "asymmetric", shape_language: "organic", typography_character: "editorial-serif", color_direction: "ink-red", imagery_strategy: "portrait-landscape-editorial", section_sequence: ["hero","editorial_intro","image_story","services","cta"], services_presentation: "image-led", proof_presentation: "credential-led", cta_presentation: "quiet-footer", nav_style: "conversion-heavy" },
    ],
    selected_direction: variationIndex,
    variant: "executive-modern",
    brand_name: genericIndustry === "travel_experience" ? "Sustainable Travel" : genericIndustry === "hospitality" ? "Eco Lodge" : genericIndustry === "food_beverage" ? "Food & Beverage" : genericIndustry === "professional_service" ? "Professional Service" : "Business",
    eyebrow: genericIndustry === "travel_experience" ? "Travel · Place · Perspective" : genericIndustry === "hospitality" ? "Stay · Explore · Restore" : genericIndustry.replaceAll("_", " "),
    headline: genericIndustry === "travel_experience" ? "Travel deeper. Leave lighter." : genericIndustry === "hospitality" ? "A stay shaped by place." : "A clearer way to experience this business.",
    subheadline: genericIndustry === "travel_experience" ? "Discover places through slower journeys, local context and thoughtful experiences." : genericIndustry === "hospitality" ? "Architecture, landscape and local character brought together in one calm experience." : "A focused page built around what matters most to the customer.",
    primary_cta: genericIndustry === "travel_experience" ? "Explore journeys" : genericIndustry === "hospitality" ? "Explore the stay" : "Explore",
    secondary_cta: genericIndustry === "travel_experience" ? "Our approach" : genericIndustry === "hospitality" ? "View experiences" : "Learn more",
    trust_line: genericIndustry === "travel_experience" ? "Journeys shaped around place, people and a lighter footprint." : genericIndustry === "hospitality" ? "Place, comfort and experience presented with clarity." : "Clear information, relevant detail and a direct next step.",
    services_title: genericIndustry === "travel_experience" ? "Travel with more context." : genericIndustry === "hospitality" ? "The stay, the place, the experience." : "What the experience is built around.",
    services_intro: genericIndustry === "travel_experience" ? "Frame each journey through landscape, local perspective and a more considered pace." : genericIndustry === "hospitality" ? "Show the rooms, surroundings and moments that make the property distinctive." : "Three focused ways the page can communicate value without generic filler.",
    services: genericIndustry === "travel_experience" ? [
      { title: "Discover", body: "Begin with place, context and a sense of why the journey matters." },
      { title: "Connect", body: "Keep local perspective and human scale at the center of the experience." },
      { title: "Travel lightly", body: "Present a more thoughtful pace without making unsupported sustainability claims." },
    ] : genericIndustry === "hospitality" ? [
      { title: "Stay", body: "Present rooms and spaces with atmosphere, context and useful detail." },
      { title: "Explore", body: "Connect the property to landscape, culture and nearby experiences." },
      { title: "Restore", body: "Show the slower moments that make the stay feel complete." },
    ] : [
      { title: "Experience", body: "Show the primary value in a way that feels specific to the business." },
      { title: "Detail", body: "Use concrete information and visual evidence instead of generic marketing language." },
      { title: "Next step", body: "Make the intended action clear without forcing the same conversion pattern everywhere." },
    ],
    proof_title: genericIndustry === "travel_experience" ? "Let the destination stay central." : genericIndustry === "hospitality" ? "Let the place do the convincing." : "Why this experience works.",
    proof_body: genericIndustry === "travel_experience" ? "Use real landscapes, people and moments to communicate character without turning travel into generic lifestyle advertising." : genericIndustry === "hospitality" ? "Use real spaces, materials and moments to communicate quality instead of generic claims." : "Use business-specific evidence, atmosphere and context instead of a fixed visual system.",
    stats: genericIndustry === "travel_experience" ? [
      { value: "Place", label: "Destination-led storytelling" },
      { value: "People", label: "Human context without spectacle" },
      { value: "Pace", label: "Journeys designed to feel considered" },
    ] : genericIndustry === "hospitality" ? [
      { value: "Stay", label: "Spaces with character" },
      { value: "Place", label: "Connected to surroundings" },
      { value: "Pace", label: "Designed for slower moments" },
    ] : [
      { value: "Focused", label: "Designed around the experience" },
      { value: "Thoughtful", label: "Details handled with care" },
      { value: "Clear", label: "Simple next steps" },
    ],
    closing_title: genericIndustry === "travel_experience" ? "Choose the journey that fits your pace." : genericIndustry === "hospitality" ? "Find your way into the place." : "Continue the story.",
    closing_body: genericIndustry === "travel_experience" ? "Move from inspiration into a clear, thoughtful way to explore what comes next." : genericIndustry === "hospitality" ? "Move from inspiration to the practical details of planning a stay." : "End with a clear action that belongs to this concept and this business.",
    hero_image_brief: genericIndustry === "travel_experience" ? "Real documentary travel photograph of a quiet natural destination with small human presence, believable daylight, authentic landscape, no signs or text." : genericIndustry === "hospitality" ? "High-end eco lodge integrated into tropical landscape, natural materials, cinematic daylight, no logos or text." : "Project-specific commercial photography with natural light and believable context, no logos or text.",
    support_image_brief: genericIndustry === "travel_experience" ? "Documentary travel detail showing place, texture and human scale in natural light, no signs or text." : genericIndustry === "hospitality" ? "Quiet lodge detail with timber, stone, greenery and soft natural light, no logos or text." : "Project-specific detail photograph showing material, process or environment, no logos or text.",
  };
  const candidate = parsed && typeof parsed === "object" ? { ...fallback, ...parsed } : { ...fallback };
  if (genericIndustry !== "generic" && (!candidate.industry || candidate.industry === "generic")) {
    candidate.industry = fallback.industry;
    candidate.design_family = fallback.design_family;
    candidate.business_model = fallback.business_model;
    candidate.customer_type = fallback.customer_type;
    candidate.conversion_goal = fallback.conversion_goal;
    if (!candidate.brand_name || /^(business|brand|company|generic)$/i.test(candidate.brand_name)) candidate.brand_name = fallback.brand_name;
    if (!candidate.eyebrow || /generic/i.test(candidate.eyebrow)) candidate.eyebrow = fallback.eyebrow;
  }
  const fallbackStyleDNA = [
    { palette: { background: "#07131C", surface: "#10212C", ink: "#F2F7F8", accent: "#68E0C1", secondary: "#76909B" }, typography: "humanist", radius: "subtle", surface: "layered", spacing: "compact", contrast: "high" },
    { palette: { background: "#EAF3F7", surface: "#FFFFFF", ink: "#16303C", accent: "#1F7084", secondary: "#8BA6B1" }, typography: "grotesk", radius: "soft", surface: "outlined", spacing: "balanced", contrast: "medium" },
    { palette: { background: "#F4EEE4", surface: "#FFF9F0", ink: "#241A16", accent: "#C9532F", secondary: "#9C8577" }, typography: "serif", radius: "square", surface: "paper", spacing: "spacious", contrast: "high" },
  ];
  const fallbackDirections = list(fallback.design_directions).map((direction, index) => experienceKind === "marketing-site" ? direction : {
    ...direction,
    headline: direction?.headline || ["See the operation before it slips.", "Work the books, not the interface.", "Move every close from signal to done."][index % 3],
    subheadline: direction?.subheadline || ["Live financial state, attention and ownership in one command surface.", "A dense accounting workspace for review, correction and execution.", "A spatial workflow for capture, approval, posting and evidence."][index % 3],
    primary_cta: direction?.primary_cta || ["Open attention", "New journal", "Start flow"][index % 3],
    secondary_cta: direction?.secondary_cta || ["View activity", "Review close", "See evidence"][index % 3],
    navigation_items: direction?.navigation_items || [
      ["Pulse","Accounts","Banking","Receivables","Close"],
      ["Workspace","Journal","Reconcile","Documents","Reports"],
      ["Flow","Exceptions","Approvals","Evidence","History"],
    ][index % 3],
    style_dna: direction?.style_dna || fallbackStyleDNA[index % fallbackStyleDNA.length],
    layout_graph: normalizeLayoutGraph(direction?.layout_graph, list(direction?.module_sequence)),
  });
  const candidateDirections = list(candidate.design_directions).slice(0, 3);
  const directionSignature = (direction = {}) => [
    text(direction.hero_layout, 80),
    text(direction.section_rhythm, 80),
    text(direction.shape_language, 80),
    text(direction.typography_character, 80),
    text(direction.color_direction, 80),
    text(direction.imagery_strategy, 80),
  ].join("|").toLowerCase();
  const heroKinds = new Set(candidateDirections.map((item) => text(item?.hero_layout, 80).toLowerCase()).filter(Boolean));
  const rhythmKinds = new Set(candidateDirections.map((item) => text(item?.section_rhythm, 80).toLowerCase()).filter(Boolean));
  const imageryKinds = new Set(candidateDirections.map((item) => text(item?.imagery_strategy, 80).toLowerCase()).filter(Boolean));
  const serviceKinds = new Set(candidateDirections.map((item) => text(item?.services_presentation, 80).toLowerCase()).filter(Boolean));
  const proofKinds = new Set(candidateDirections.map((item) => text(item?.proof_presentation, 80).toLowerCase()).filter(Boolean));
  const ctaKinds = new Set(candidateDirections.map((item) => text(item?.cta_presentation, 80).toLowerCase()).filter(Boolean));
  const sequenceKinds = new Set(candidateDirections.map((item) => list(item?.section_sequence).map((value) => text(value, 40)).filter(Boolean).join(">")).filter(Boolean));
  const shellKinds = new Set(candidateDirections.map((item) => text(item?.composition_shell, 80).toLowerCase()).filter(Boolean));
  const moduleKinds = new Set(candidateDirections.map((item) => list(item?.module_sequence).map((value) => text(value, 80).toLowerCase()).filter(Boolean).join(">")).filter(Boolean));
  const graphKinds = new Set(candidateDirections.map((item) => list(item?.layout_graph).map((node) => `${text(node?.type, 40)}:${Number(node?.span) || 1}:${text(node?.height, 20)}`).join(">")).filter(Boolean));
  const signatures = new Set(candidateDirections.map(directionSignature).filter(Boolean));
  const navigationKinds = new Set(candidateDirections.map((item) => text(item?.navigation_mode, 80).toLowerCase()).filter(Boolean));
  const densityKinds = new Set(candidateDirections.map((item) => text(item?.information_density, 80).toLowerCase()).filter(Boolean));
  const styleKinds = new Set(candidateDirections.map((item) => {
    const style = item?.style_dna || {};
    const palette = style?.palette || {};
    return [text(style?.typography, 30), text(style?.radius, 30), text(style?.surface, 30), text(palette?.background, 16), text(palette?.accent, 16)].join("|").toLowerCase();
  }).filter(Boolean));
  const blueprintDiverse = shellKinds.size >= 2 && moduleKinds.size >= 3 && graphKinds.size >= 3;
  const marketingDiverse = candidateDirections.length === 3 &&
    signatures.size === 3 &&
    heroKinds.size >= 3 &&
    rhythmKinds.size >= 3 &&
    imageryKinds.size >= 3 &&
    serviceKinds.size >= 3 &&
    proofKinds.size >= 3 &&
    ctaKinds.size >= 3 &&
    sequenceKinds.size >= 3;
  const operationalDiverse = candidateDirections.length === 3 &&
    blueprintDiverse &&
    navigationKinds.size >= 2 &&
    densityKinds.size >= 2 &&
    styleKinds.size >= 3;
  const diverseDirections = experienceKind === "marketing-site" ? marketingDiverse : operationalDiverse;
  const designDirections = diverseDirections ? candidateDirections : fallbackDirections;
  const researchEvidenceAvailable = Boolean(designResearch && list(designResearch?.sources).length >= 2);
  const researchedStructureAccepted = Boolean(researchEvidenceAvailable && diverseDirections);
  const dynamicResearchApplied = researchedStructureAccepted;
  const selectedDirection = Math.max(0, Math.min(2, Number.isFinite(Number(candidate.selected_direction)) ? Number(candidate.selected_direction) : variationIndex));
  const selected = designDirections[selectedDirection] || designDirections[0] || {};
  const schema = {
    ...candidate,
    design_directions: designDirections,
    selected_direction: selectedDirection,
    hero_layout: text(selected.hero_layout, 80) || candidate.hero_layout || fallback.hero_layout,
    section_rhythm: text(selected.section_rhythm, 80) || candidate.section_rhythm || fallback.section_rhythm,
    shape_language: text(selected.shape_language, 80) || candidate.shape_language || fallback.shape_language,
    typography_character: text(selected.typography_character, 80) || candidate.typography_character || fallback.typography_character,
    color_direction: text(selected.color_direction, 80) || candidate.color_direction || fallback.color_direction,
    imagery_strategy: text(selected.imagery_strategy, 80) || candidate.imagery_strategy || fallback.imagery_strategy,
    section_sequence: list(selected.section_sequence).map((value) => text(value, 40)).filter(Boolean),
    services_presentation: text(selected.services_presentation, 80) || candidate.services_presentation || "timeline",
    proof_presentation: text(selected.proof_presentation, 80) || candidate.proof_presentation || "image-story",
    cta_presentation: text(selected.cta_presentation, 80) || candidate.cta_presentation || "quiet-footer",
    nav_style: text(selected.nav_style, 80) || candidate.nav_style || "minimal",
  };
  return {
    success: true,
    contract: CODE_AI_DESIGN_PREVIEW_CONTRACT,
    preview: {
      contract: CODE_AI_DESIGN_PREVIEW_CONTRACT,
      title: "Live design prototype",
      summary: dynamicResearchApplied
        ? designQualityPassed
          ? "Original render synthesized from fresh public design research. Repository unchanged."
          : "Researched visual directions preserved; weak copy was safely repaired or neutralized. Repository unchanged."
        : "Safe local visual direction used because the researched structure was incomplete or unavailable. Repository unchanged.",
      schema,
      research_applied: dynamicResearchApplied,
      research_evidence_available: researchEvidenceAvailable,
      researched_structure_accepted: researchedStructureAccepted,
      schema_complete: dynamicSchemaComplete,
      quality_gate: { passed: designQualityPassed, issues: designQualityIssues },
    },
    provider: text(identityExecution?.provider || sectionExecution?.provider || directionExecution?.provider, 160) || null,
    raw_reasoning_returned: false,
  };
}

export async function createCodeAIVisualArtifact({
  organizationId,
  partyId = null,
  message,
  recentConversation = [],
  workspace = {},
  preferredKind = null,
} = {}) {
  const userMessage = text(message, 5000);
  if (!organizationId) throw new Error("CODE_AI_VISUAL_ORGANIZATION_REQUIRED");
  if (!userMessage) throw new Error("CODE_AI_VISUAL_MESSAGE_REQUIRED");

  const repositoryUrl = text(workspace.repository_url, 1000) || null;
  const conversation = compactConversation(recentConversation);
  const visualKind = text(preferredKind, 40).toLowerCase();
  const instructions = [
    "You are Avantiqo Code creating a visual reasoning artifact for the user.",
    "Do not reveal private chain-of-thought. Show only a concise, inspectable representation of the conclusion: architecture, user flow, wireframe, component map, or decision board.",
    "Anchor the visual in the actual project conversation. Do not invent Avantiqo product assumptions for another project.",
    "Return exactly one JSON object with: contract, kind, title, summary, nodes, edges.",
    "kind must be one of architecture, flow, wireframe, component_map, decision_board.",
    "nodes must be an array of 2-6 objects with id, label, detail, group, emphasis. Keep labels short and each detail under 22 words.",
    "edges must be an array of objects with from, to, label. Use only node ids that exist. For wireframes and decision boards, return an empty edges array to keep the artifact compact.",
    "emphasis may be primary, secondary, warning, or neutral.",
    "For wireframes, groups should describe screen regions such as header, sidebar, main, panel, footer.",
    "For decision boards, each node should be a distinct option with its main tradeoff.",
    repositoryUrl ? `Active repository: ${repositoryUrl}` : "No repository identity is required.",
    visualKind ? `Preferred visual kind: ${visualKind}` : "Choose the visual kind that best fits the discussion.",
  ].join("\\n");

  void partyId;
  const execution = await executeIntelligenceLocalQueueAndWait({
    capability: "ai.text.generate",
    execution_lane: "front",
    messages: [
      { role: "system", content: instructions },
      ...conversation,
      { role: "user", content: userMessage },
    ],
    temperature: 0.2,
    max_output_tokens: 320,
    response_format: { type: "json_object" },
    front_task_mode: "code_deep_conversation",
    context: {
      organization_id: organizationId,
      usage_id: `code-visual:${randomUUID()}`,
    },
    metadata: {
      module: "CODE_IDE",
      operation: "VISUAL_ARTIFACT",
      latency_class: "interactive",
      owned_reasoning_only: true,
      external_fallback_allowed: false,
      mutation_authority: false,
      raw_reasoning_persisted: false,
    },
  }, { timeout_ms: 90000, poll_ms: 100 });

  const rawVisualSource = execution?.output?.text ?? findText(execution?.output || execution);
  const rawVisualText = text(rawVisualSource, 30000);
  let directParsed = null;
  try { directParsed = JSON.parse(rawVisualText); } catch {}
  const parsed = directParsed || parseVisualArtifactText(rawVisualText);
  if (!parsed) throw new Error("CODE_AI_VISUAL_INVALID_RESPONSE");
  const nodes = list(parsed.nodes).slice(0, 12).map((node, index) => ({
    id: text(node?.id, 80) || `node-${index + 1}`,
    label: text(node?.label, 160) || `Item ${index + 1}`,
    detail: text(node?.detail, 600) || null,
    group: text(node?.group, 120) || null,
    emphasis: ["primary", "secondary", "warning", "neutral"].includes(text(node?.emphasis, 40))
      ? text(node?.emphasis, 40)
      : "neutral",
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = list(parsed.edges).slice(0, 20).map((edge) => ({
    from: text(edge?.from, 80),
    to: text(edge?.to, 80),
    label: text(edge?.label, 160) || null,
  })).filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to);

  return {
    success: true,
    contract: CODE_AI_VISUAL_ARTIFACT_CONTRACT,
    artifact: {
      contract: CODE_AI_VISUAL_ARTIFACT_CONTRACT,
      kind: ["architecture", "flow", "wireframe", "component_map", "decision_board"].includes(text(parsed.kind, 40))
        ? text(parsed.kind, 40)
        : "decision_board",
      title: text(parsed.title, 240) || "Visual plan",
      summary: text(parsed.summary, 1000) || null,
      nodes,
      edges,
    },
    provider: text(execution?.provider, 160) || null,
    raw_reasoning_returned: false,
  };
}

export async function reasonAboutCodeConversationTurn({
  organizationId,
  partyId = null,
  message,
  recentConversation = [],
  workspace = {},
} = {}) {
  const userMessage = text(message, 5000);
  if (!organizationId) throw new Error("CODE_AI_CONVERSATION_ORGANIZATION_REQUIRED");
  if (!userMessage) throw new Error("CODE_AI_CONVERSATION_MESSAGE_REQUIRED");

  const discussionOnly = /\b(no|do not|don't|dont|not yet|just|only)\b[\s\S]{0,100}\b(build|code|change|edit|implement|repository work|repo work|start work|touch the code)\b/i.test(userMessage)
    || /\b(just|only)\s+(want to\s+)?(discuss|talk|plan|think through|brainstorm)\b/i.test(userMessage);
  const explanatoryQuestion = discussionOnly
    || /^\s*(what|why|how|where|when|who|which)\b/i.test(userMessage)
    || /^\s*(can you explain|could you explain|tell me about|help me understand)\b/i.test(userMessage)
    || /\b(what|why|how|which)\s+(should|would|does|do|is|are|can)\b/i.test(userMessage)
    || /^\s*if\b[\s\S]*\b(what|why|how|which)\b/i.test(userMessage);
  const directBuildRequest = !discussionOnly
    && /^\s*(can you|could you|please|i want you to|build|make|create|add|implement|fix|change|update|continue)\b/i.test(userMessage)
    && /\b(find|fix|check|inspect|debug|test|build|improve|verify|repair|change|update|make|create|add|implement|trace|investigate|tighten|upgrade|continue)\b/i.test(userMessage);
  const explicitRepositoryWorkRequested = !discussionOnly && (directBuildRequest || (
    !explanatoryQuestion &&
    /\b(find|fix|check|inspect|debug|test|build|improve|verify|repair|change|update|make|create|add|implement|trace|investigate|tighten|upgrade|continue)\b/i.test(userMessage)
  ));
  if (explicitRepositoryWorkRequested) {
    return {
      success: true,
      contract: CODE_AI_CONVERSATION_CONTRACT,
      reply: "I’m on it. I’m working this in the live repository now and I’ll keep responsibility until the requirement is verified.",
      needs_repository_work: true,
      execution_objective: userMessage,
      clarification_needed: false,
      provider: "avantiqo-code-controller",
      raw_reasoning_returned: false,
      immediate_execution_acknowledgement: true,
    };
  }

  const repositoryUrl = text(workspace.repository_url, 1000) || null;
  const conversation = compactConversation(recentConversation);
  const deepDiscussion = /\b(product direction|product ideas|technical ideas|architecture|data model|api|integration|ux|layout|navigation|visual design|design direction|typography|spacing|mvp|tradeoff|tradeoffs|brainstorm|ideas)\b/i.test(userMessage);
  const instructions = [
    "You are Avantiqo Code, a senior software/product engineer talking live with the user inside the IDE.",
    "This turn is discussion only. Do not start repository work, do not claim to have changed code, and do not turn the answer into a work order.",
    "Talk naturally, directly, and thoughtfully. Respond to the actual idea, disagreement, question, or tradeoff instead of giving generic software advice.",
    "When the user asks for ideas, architecture options, UX/layout directions, or visual design directions, first anchor the answer in concrete facts already established in the live conversation. Name the relevant user, workflow, pain point, constraint, or existing system before proposing solutions. Do not fall back to generic SaaS features when the conversation already contains more specific context.",
    "Give genuinely distinct alternatives with concrete tradeoffs. Prefer 2-4 strong options over a vague brainstorm, and explain which direction you would explore first and why.",
    "For technical discussions, consider architecture, data model, APIs, integrations, performance, security, operational cost, maintainability, deployment and migration constraints when relevant.",
    "For UX/layout discussions, consider information hierarchy, navigation, workflows, desktop/mobile behavior, density, empty/loading/error states and accessibility when relevant.",
    "For visual design discussions, consider hierarchy, typography, spacing, components, interaction feel, visual density, motion and responsive behavior when relevant.",
    "Use the previous conversation turns to maintain context and adapt when the user disagrees or changes direction.",
    "Avantiqo Code is the engineering tool, not the user's product. The active repository and user brief define the product.",
    "Never import Avantiqo product domains, UI style, workflows, organization/entity concepts, stack choices, or provider choices into another project unless that project explicitly requires them.",
    repositoryUrl ? `Active project repository: ${repositoryUrl}` : "No repository identity is required for this discussion.",
    "Keep the answer concise enough for a live conversation, normally 2-5 sentences. No JSON. No headings unless the user asks for them.",
  ].join("\n");

  void partyId;
  const execution = await executeIntelligenceLocalQueueAndWait({
    capability: "ai.text.generate",
    execution_lane: "front",
    messages: [
      { role: "system", content: instructions },
      ...conversation,
      { role: "user", content: userMessage },
    ],
    temperature: deepDiscussion ? 0.35 : 0.25,
    max_output_tokens: deepDiscussion ? 220 : 110,
    front_task_mode: deepDiscussion ? "code_deep_conversation" : "code_live_conversation",
    context: {
      organization_id: organizationId,
      usage_id: `code-live:${randomUUID()}`,
    },
    metadata: {
      module: "CODE_IDE",
      operation: "LIVE_CONVERSATION",
      latency_class: "realtime",
      code_ai_conversation_contract: CODE_AI_CONVERSATION_CONTRACT,
      owned_reasoning_only: true,
      external_fallback_allowed: false,
      mutation_authority: false,
      raw_reasoning_persisted: false,
    },
  }, { timeout_ms: deepDiscussion ? 110000 : 45000, poll_ms: 100 });

  const reply = text(findText(execution?.output || execution), 4000);
  if (!reply) throw new Error("CODE_AI_CONVERSATION_EMPTY_RESPONSE");
  return {
    success: true,
    contract: CODE_AI_CONVERSATION_CONTRACT,
    reply,
    needs_repository_work: false,
    execution_objective: null,
    clarification_needed: false,
    provider: text(execution?.provider, 160) || null,
    generate_visual_example: visualExampleRequested(userMessage),
    raw_reasoning_returned: false,
  };
}
