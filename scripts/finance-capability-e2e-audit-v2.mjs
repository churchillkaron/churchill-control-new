#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const REPORT = process.env.FINANCE_E2E_REPORT || "/tmp/AVANTIQO_FINANCE_67_CAPABILITY_E2E.json";
const SCREENSHOT_DIR = process.env.FINANCE_E2E_SCREENSHOTS || "/tmp/AVANTIQO_FINANCE_67_CAPABILITY_SCREENSHOTS";
const ONLY = String(process.env.FINANCE_E2E_ONLY || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

const TECHNICAL_LABELS = [
  /^id$/i,
  /\buuid\b/i,
  /\borganization id\b/i,
  /\bentity id\b/i,
  /\bperiod id\b/i,
  /\bcustomer id\b/i,
  /\bvendor id\b/i,
  /\bparty id\b/i,
  /\baccount id\b/i,
  /\bmetadata\b/i,
  /\bvalue json\b/i,
  /\bpayload\b/i,
  /\braw data\b/i,
];

const CONTROLLED_FIELDS = {
  finance_permissions: ["Finance Role", "Permission"],
};

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function firstMatch(text, pattern) {
  return String(text || "").match(pattern)?.[1] || null;
}

function financeSection(source) {
  const start = source.indexOf("finance: {");
  if (start < 0) return "";
  const end = source.indexOf("\n    people:", start);
  return end > start ? source.slice(start, end) : source.slice(start);
}

function findMatching(source, start, openChar, closeChar) {
  if (source[start] !== openChar) return -1;
  let depth = 0;
  let quote = null;
  let template = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (template) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "`") template = false;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === "`") {
      template = true;
      continue;
    }
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function capabilityBlock(financeRegistry, id) {
  const patterns = [`id: "${id}"`, `id:"${id}"`, `id: '${id}'`, `id:'${id}'`];
  let markerIndex = -1;
  for (const marker of patterns) {
    markerIndex = financeRegistry.indexOf(marker);
    if (markerIndex >= 0) break;
  }
  if (markerIndex < 0) return "";
  const start = financeRegistry.lastIndexOf("{", markerIndex);
  if (start < 0) return "";
  const end = findMatching(financeRegistry, start, "{", "}");
  return end > start ? financeRegistry.slice(start, end + 1) : "";
}

function extractPropertyContainer(source, property, openChar, closeChar) {
  const pattern = new RegExp(`\\b${property}\\s*:`);
  const match = pattern.exec(source);
  if (!match) return "";
  let start = match.index + match[0].length;
  while (/\s/.test(source[start] || "")) start += 1;
  if (source[start] !== openChar) return "";
  const end = findMatching(source, start, openChar, closeChar);
  return end > start ? source.slice(start, end + 1) : "";
}

function extractAllPropertyContainers(source, property, openChar, closeChar) {
  const values = [];
  const pattern = new RegExp(`\\b${property}\\s*:`, "g");
  let match = null;
  while ((match = pattern.exec(source))) {
    let start = match.index + match[0].length;
    while (/\s/.test(source[start] || "")) start += 1;
    if (source[start] !== openChar) continue;
    const end = findMatching(source, start, openChar, closeChar);
    if (end > start) {
      values.push(source.slice(start, end + 1));
      pattern.lastIndex = end + 1;
    }
  }
  return values;
}

function topLevelObjects(arraySource) {
  if (!arraySource.startsWith("[")) return [];
  const objects = [];
  for (let index = 1; index < arraySource.length - 1; index += 1) {
    if (arraySource[index] !== "{") continue;
    const end = findMatching(arraySource, index, "{", "}");
    if (end < 0) break;
    objects.push(arraySource.slice(index, end + 1));
    index = end;
  }
  return objects;
}

function actionEntries(arraySource) {
  return topLevelObjects(arraySource).map(source => ({
    id: firstMatch(source, /\bid\s*:\s*["']([^"']+)["']/),
    type: firstMatch(source, /\btype\s*:\s*["']([^"']+)["']/),
    label: firstMatch(source, /\blabel\s*:\s*["']([^"']+)["']/),
  })).filter(action => action.id || action.type || action.label);
}

function registryDefinition(capabilityId, financeRegistry) {
  const block = capabilityBlock(financeRegistry, capabilityId);
  const createBlock = extractPropertyContainer(block, "create", "{", "}");
  const topMenuBlock = extractPropertyContainer(block, "topMenu", "[", "]");
  const rowMenuBlock = extractPropertyContainer(block, "rowMenu", "[", "]");
  const fallbackActions = extractPropertyContainer(block, "actions", "[", "]");
  const rowSource = rowMenuBlock || fallbackActions;

  return {
    blockFound: Boolean(block),
    createEnabled: Boolean(createBlock && /\benabled\s*:\s*true/.test(createBlock)),
    createForm: firstMatch(createBlock, /\bform\s*:\s*["']([^"']+)["']/),
    createTitle: firstMatch(createBlock, /\btitle\s*:\s*["']([^"']+)["']/),
    createLabel: firstMatch(createBlock, /\blabel\s*:\s*["']([^"']+)["']/),
    topActions: actionEntries(topMenuBlock),
    rowActions: actionEntries(rowSource),
    hasTopMenu: Boolean(topMenuBlock),
    hasRowMenu: Boolean(rowSource),
  };
}

function resolveCapabilities(financeRegistry) {
  const manifest = JSON.parse(read("lib/finance/runtime/financeCapabilityRuntimeManifest.json"));
  const contracts = read("lib/finance/workspaces/FinanceWorkspaceContracts.js");

  return Object.entries(manifest).map(([id, definition]) => {
    const block = capabilityBlock(financeRegistry, id);
    const runtimeBlocks = extractAllPropertyContainers(block, "runtime", "{", "}");
    const uiBlocks = extractAllPropertyContainers(block, "ui", "{", "}");
    const listApi = runtimeBlocks.map(value => firstMatch(value, /\blistApi\s*:\s*["']([^"']+)["']/)).find(Boolean) || null;
    const uiApi = uiBlocks.map(value => firstMatch(value, /\bapi\s*:\s*["']([^"']+)["']/)).find(Boolean) || null;
    const contract = new RegExp(`\\b${id}\\s*:`).test(contracts);

    return {
      id,
      name: firstMatch(block, /\bname\s*:\s*["']([^"']+)["']/) || id,
      route: firstMatch(block, /\broute\s*:\s*["']([^"']+)["']/),
      api: definition.api || listApi || uiApi || (contract ? `/api/finance/workspaces/${id}` : null),
      kind: definition.kind,
      scope: definition.scope,
      contract,
      blockFound: Boolean(block),
      apiSource: definition.api ? "manifest" : listApi ? "runtime.listApi" : uiApi ? "ui.api" : contract ? "dynamic-contract" : null,
    };
  });
}

function check(status, reason = null, evidence = null) {
  return { status, reason, evidence };
}

function summarizeChecks(checks) {
  const values = Object.values(checks);
  if (values.some(item => item.status === "FAIL")) return "FAIL";
  if (values.some(item => item.status === "BLOCKED")) return "BLOCKED";
  return "PASS";
}

function isRawIdentifier(text) {
  const value = String(text || "").trim();
  return /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(value) ||
    /^[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]+){1,}$/.test(value);
}

async function loadSmokeHarness() {
  const sourcePath = path.join(ROOT, "scripts/finance-real-browser-smoke.mjs");
  const source = fs.readFileSync(sourcePath, "utf8");
  const stripped = source.replace(/\nmain\(\)\.catch\([\s\S]*$/m, "\n");
  const generatedPath = path.join(ROOT, "scripts", `.finance-smoke-harness-${process.pid}.mjs`);
  const exports = `\nexport {\n  resolveServer, launchChrome, createPage, login, evaluate, navigate,\n  captureScreenshot, fetchApi, inspectPage, sleep,\n  parseEnvFile, promptVisible, promptHidden, safeFileName\n};\n`;
  fs.writeFileSync(generatedPath, stripped + exports);
  try {
    return await import(`${pathToFileURL(generatedPath).href}?v=${Date.now()}`);
  } finally {
    fs.rmSync(generatedPath, { force: true });
  }
}

async function clickButton(harness, client, matcher, preference = "first") {
  const payload = JSON.stringify({ matcher, preference });
  return harness.evaluate(client, `(() => {
    const config = ${payload};
    const buttons = Array.from(document.querySelectorAll("button"))
      .filter(button => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
      });
    const normalized = value => String(value || "").replace(/\\s+/g, " ").trim();
    const candidates = buttons.filter(button => {
      const text = normalized(button.textContent);
      if (config.matcher.type === "exact") return text.toLowerCase() === config.matcher.value.toLowerCase();
      if (config.matcher.type === "starts") return text.toLowerCase().startsWith(config.matcher.value.toLowerCase());
      if (config.matcher.type === "includes") return text.toLowerCase().includes(config.matcher.value.toLowerCase());
      return false;
    });
    const button = config.preference === "last" ? candidates.at(-1) : candidates[0];
    if (!button) return { clicked: false, candidates: buttons.map(item => normalized(item.textContent)).filter(Boolean) };
    button.click();
    return { clicked: true, text: normalized(button.textContent), count: candidates.length };
  })()`);
}

async function closeOverlay(harness, client) {
  for (const label of ["Close", "Cancel", "Back"]) {
    const result = await clickButton(harness, client, { type: "exact", value: label }, "last");
    if (result.clicked) {
      await harness.sleep(350);
      return true;
    }
  }
  await harness.evaluate(client, `(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return true;
  })()`);
  await harness.sleep(250);
  return false;
}

async function inspectVisibleUi(harness, client) {
  return harness.evaluate(client, `(() => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0 && rect.width > 2 && rect.height > 2;
    };
    const text = element => String(element?.textContent || "").replace(/\\s+/g, " ").trim();
    const bodyText = text(document.body);
    const buttons = Array.from(document.querySelectorAll("button")).filter(visible).map(text).filter(Boolean);
    const labels = Array.from(document.querySelectorAll("label")).filter(visible).map(text).filter(Boolean);
    const headings = Array.from(document.querySelectorAll("h1,h2,h3")).filter(visible).map(text).filter(Boolean);
    const inputs = Array.from(document.querySelectorAll("input,select,textarea")).filter(visible).map(input => ({
      tag: input.tagName.toLowerCase(),
      type: input.type || null,
      name: input.name || null,
      required: Boolean(input.required),
      disabled: Boolean(input.disabled),
    }));
    return {
      bodyText,
      buttons,
      labels,
      headings,
      inputs,
      hasTable: Boolean(Array.from(document.querySelectorAll("table")).find(visible)),
      hasModal: Boolean(Array.from(document.querySelectorAll('[role="dialog"], .fixed.inset-0')).find(visible)),
      uuidCount: (bodyText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi) || []).length,
    };
  })()`);
}

function technicalLeaks(ui) {
  const leaks = [];
  for (const label of ui.labels || []) {
    if (TECHNICAL_LABELS.some(pattern => pattern.test(label))) leaks.push(`technical label: ${label}`);
  }
  for (const heading of ui.headings || []) {
    if (isRawIdentifier(heading)) leaks.push(`raw heading: ${heading}`);
  }
  for (const button of ui.buttons || []) {
    if (isRawIdentifier(button)) leaks.push(`raw action: ${button}`);
  }
  if (/\bRow Action\b/i.test(ui.bodyText || "") && /\bOpen\b/i.test(ui.bodyText || "")) {
    leaks.push("generic Row Action / Open detail modal");
  }
  if (/\bMetadata\b/i.test(ui.bodyText || "") || /\bValue Json\b/i.test(ui.bodyText || "")) {
    leaks.push("database JSON fields exposed");
  }
  return [...new Set(leaks)];
}

async function inspectCreateForm(harness, client, capability, definition) {
  if (!definition.createEnabled) return check("N/A", "create is not enabled");
  const expected = String(definition.createLabel || "+").replace(/^\+\s*/, "").trim();
  let clicked = await clickButton(harness, client, { type: "exact", value: definition.createLabel || `+ ${expected}` });
  if (!clicked.clicked) clicked = await clickButton(harness, client, { type: "starts", value: "+" });
  if (!clicked.clicked) return check("FAIL", "primary create button missing", { expected: definition.createLabel, buttons: clicked.candidates });

  await harness.sleep(450);
  const ui = await inspectVisibleUi(harness, client);
  const reasons = [];
  if (!ui.hasModal) reasons.push("create form did not open in a visible modal");
  if (!ui.inputs.length) reasons.push("create form has no interactive fields");
  if ((ui.headings || []).some(isRawIdentifier)) reasons.push("create title exposes an internal identifier");

  const controlled = CONTROLLED_FIELDS[capability.id] || [];
  for (const label of controlled) {
    const labelIndex = ui.labels.findIndex(value => value.toLowerCase().includes(label.toLowerCase()));
    if (labelIndex < 0) {
      reasons.push(`controlled field missing: ${label}`);
      continue;
    }
    const field = ui.inputs[labelIndex] || null;
    if (!field || field.tag !== "select") reasons.push(`${label} is free text instead of a controlled lookup`);
  }

  reasons.push(...technicalLeaks(ui));
  await closeOverlay(harness, client);
  return reasons.length ? check("FAIL", reasons.join("; "), ui) : check("PASS", null, ui);
}

async function fetchCapabilityApi(harness, client, api, context) {
  if (!api) return { skipped: true, reason: "no read API" };
  const url = new URL(api, "http://avantiqo.local");
  url.searchParams.set("organizationId", context.organizationId);
  url.searchParams.set("organization_id", context.organizationId);
  if (context.entityId) {
    url.searchParams.set("entityId", context.entityId);
    url.searchParams.set("entity_id", context.entityId);
  }
  if (context.periodId) {
    url.searchParams.set("periodId", context.periodId);
    url.searchParams.set("period_id", context.periodId);
  }
  const relative = `${url.pathname}${url.search}`;

  return harness.evaluate(client, `(async () => {
    const response = await fetch(${JSON.stringify(relative)}, { credentials: "include" });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let data = null;
    if (contentType.includes("application/json")) {
      try { data = JSON.parse(text); } catch {}
    }
    const findRows = value => {
      if (Array.isArray(value)) return value;
      if (!value || typeof value !== "object") return null;
      const preferred = ["rows", "records", "items", "entries", "lines", "data", "accounts", "journals", "customers", "vendors", "invoices", "payments", "periods", "dimensions", "assets", "templates", "reports"];
      for (const key of preferred) {
        if (Array.isArray(value[key])) return value[key];
      }
      for (const nested of Object.values(value)) {
        if (Array.isArray(nested)) return nested;
      }
      return null;
    };
    const rows = findRows(data);
    return {
      url: ${JSON.stringify(relative)},
      status: response.status,
      ok: response.ok,
      contentType,
      json: Boolean(data),
      success: data?.success,
      unavailable: data?.unavailable === true,
      rowCount: Array.isArray(rows) ? rows.length : null,
      rowKeyDetected: Array.isArray(rows),
      bodyPreview: text.slice(0, 700),
    };
  })()`);
}

async function inspectMenusAndDetail(harness, client, capability, definition, rowCount) {
  const topExpected = definition.topActions.length;
  const rowExpected = definition.rowActions.length;
  let ui = await inspectVisibleUi(harness, client);
  const topChecks = [];
  const rawVisible = ui.buttons.filter(isRawIdentifier);
  if (rawVisible.length) topChecks.push(`raw visible actions: ${rawVisible.join(", ")}`);

  const ellipsis = await clickButton(harness, client, { type: "exact", value: "..." }, "first");
  if (ellipsis.clicked) {
    await harness.sleep(250);
    ui = await inspectVisibleUi(harness, client);
    const rawMenu = ui.buttons.filter(isRawIdentifier);
    if (rawMenu.length) topChecks.push(`raw menu actions: ${rawMenu.join(", ")}`);
    await closeOverlay(harness, client);
  } else if (topExpected > 0) {
    topChecks.push("top action menu could not be opened");
  }

  const topActions = topChecks.length ? check("FAIL", topChecks.join("; "), ui) : check("PASS", null, { expected: topExpected });

  if (!rowExpected) {
    return {
      topActions,
      rowActions: check("N/A", "no row actions configured"),
      detailView: check("N/A", "no row actions configured"),
    };
  }
  if (!(Number(rowCount) > 0)) {
    return {
      topActions,
      rowActions: check("BLOCKED", "no real row exists to exercise row actions"),
      detailView: check("BLOCKED", "no real row exists to open"),
    };
  }

  const rowMenu = await clickButton(harness, client, { type: "exact", value: "..." }, "last");
  if (!rowMenu.clicked) {
    return {
      topActions,
      rowActions: check("FAIL", "row action menu button missing"),
      detailView: check("FAIL", "detail view could not be opened"),
    };
  }
  await harness.sleep(250);
  ui = await inspectVisibleUi(harness, client);
  const rawActions = ui.buttons.filter(isRawIdentifier);
  const rowActions = rawActions.length
    ? check("FAIL", `raw row actions: ${rawActions.join(", ")}`, ui)
    : check("PASS", null, ui);

  const open = await clickButton(harness, client, { type: "exact", value: "Open" });
  if (!open.clicked) {
    await closeOverlay(harness, client);
    return {
      topActions,
      rowActions,
      detailView: check("FAIL", "Open action missing from row menu", ui),
    };
  }

  await harness.sleep(350);
  const detailUi = await inspectVisibleUi(harness, client);
  const leaks = technicalLeaks(detailUi);
  const detailView = leaks.length
    ? check("FAIL", leaks.join("; "), detailUi)
    : check("PASS", null, detailUi);
  await closeOverlay(harness, client);
  return { topActions, rowActions, detailView };
}

async function main() {
  const harness = await loadSmokeHarness();
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const localEnv = harness.parseEnvFile(path.join(ROOT, ".env.local"));
  const email = process.env.FINANCE_SMOKE_EMAIL || localEnv.FINANCE_SMOKE_EMAIL || await harness.promptVisible("Finance E2E login email: ");
  const password = process.env.FINANCE_SMOKE_PASSWORD || localEnv.FINANCE_SMOKE_PASSWORD || await harness.promptHidden("Finance E2E login password: ");
  if (!email || !password) throw new Error("Finance E2E login email and password are required");

  let server = null;
  let chrome = null;
  let client = null;
  const cleanup = () => {
    try { client?.close(); } catch {}
    try { chrome?.child?.kill("SIGTERM"); } catch {}
    try { server?.child?.kill("SIGTERM"); } catch {}
    try { if (chrome?.userDataDir) fs.rmSync(chrome.userDataDir, { recursive: true, force: true }); } catch {}
  };

  try {
    console.log("============================================================");
    console.log("AVANTIQO FINANCE 67-CAPABILITY END-TO-END AUDIT V2");
    console.log("NON-DESTRUCTIVE: NO CREATE, POST, APPROVE OR DELETE IS SENT");
    console.log("REGISTRY PARSER=BALANCED_OBJECT_V2");
    console.log("============================================================");

    server = await harness.resolveServer();
    chrome = await harness.launchChrome();
    client = await harness.createPage(chrome.endpoint);
    const bootstrap = await harness.login(client, server.baseUrl, email, password);
    const context = {
      organizationId: bootstrap.active_organization_id || bootstrap.organization_id || bootstrap.organization?.id || null,
      entityId: bootstrap.active_entity_id || bootstrap.entity_id || bootstrap.entity?.id || null,
      periodId: bootstrap.active_period_id || bootstrap.period_id || bootstrap.period?.id || null,
      organizationName: bootstrap.organization?.name || bootstrap.organization?.legal_name || null,
      entityName: bootstrap.entity?.name || bootstrap.entity?.legal_name || null,
      periodName: bootstrap.period?.name || bootstrap.period?.label || null,
    };

    const financeRegistry = financeSection(read("lib/platform/registry/erpRegistry.js"));
    let capabilities = resolveCapabilities(financeRegistry);
    if (ONLY.length) capabilities = capabilities.filter(capability => ONLY.includes(capability.id));
    if (!capabilities.length) throw new Error(`No Finance capabilities matched FINANCE_E2E_ONLY=${ONLY.join(",")}`);

    const parserFailures = capabilities.filter(capability => !capability.blockFound || !capability.route);
    if (parserFailures.length) {
      throw new Error(`Registry parser failed for: ${parserFailures.map(item => item.id).join(", ")}`);
    }

    const results = [];
    for (const [index, capability] of capabilities.entries()) {
      const definition = registryDefinition(capability.id, financeRegistry);
      const pageUrl = `${server.baseUrl}/workspace/${context.organizationId}${capability.route}`;
      const checks = {};
      const startedAt = Date.now();
      let screenshot = null;
      console.log(`\n[${index + 1}/${capabilities.length}] ${capability.id} - ${capability.name}`);
      console.log(`  parser: api=${capability.api || "none"} source=${capability.apiSource || "none"} top=${definition.topActions.length} row=${definition.rowActions.length} create=${definition.createEnabled}`);

      try {
        await harness.navigate(client, pageUrl);
        const page = await harness.inspectPage(client, capability.name);
        checks.page = page.knownError || page.unavailable || page.loadingOnly || page.bodyLength < 30 || !page.expectedNameFound
          ? check("FAIL", page.knownError || page.unavailable || (page.loadingOnly ? "loading only" : "page shell incomplete"), page)
          : check("PASS", null, page);

        const api = await fetchCapabilityApi(harness, client, capability.api, context);
        checks.realDataApi = api.skipped
          ? check("BLOCKED", api.reason)
          : (!api.ok || !api.json || api.success === false || api.unavailable)
            ? check("FAIL", `HTTP ${api.status}: ${api.bodyPreview || "read API failed"}`, api)
            : check("PASS", null, api);

        const shellUi = await inspectVisibleUi(harness, client);
        const contextMissing = [];
        if (context.organizationName && !shellUi.bodyText.includes(context.organizationName)) contextMissing.push("organization");
        if (capability.scope === "entity" && context.entityName && !shellUi.bodyText.includes(context.entityName)) contextMissing.push("legal entity");
        checks.context = contextMissing.length
          ? check("FAIL", `context not visibly resolved: ${contextMissing.join(", ")}`, shellUi)
          : check("PASS", null, { organization: context.organizationName, entity: context.entityName, period: context.periodName });

        checks.createForm = await inspectCreateForm(harness, client, capability, definition);
        await harness.navigate(client, pageUrl);
        const menuChecks = await inspectMenusAndDetail(harness, client, capability, definition, api.rowCount);
        checks.topActions = menuChecks.topActions;
        checks.rowActions = menuChecks.rowActions;
        checks.detailView = menuChecks.detailView;

        const finalUi = await inspectVisibleUi(harness, client);
        const leaks = technicalLeaks(finalUi);
        checks.technicalLeakage = leaks.length ? check("FAIL", leaks.join("; "), finalUi) : check("PASS");
        checks.previewOrReport = capability.kind === "report"
          ? (checks.realDataApi.status === "PASS" && checks.page.status === "PASS" ? check("PASS") : check("FAIL", "report did not pass page and data checks"))
          : check("N/A", "not a report; document preview requires an eligible record/action");
      } catch (error) {
        checks.page = checks.page || check("FAIL", error.message);
      }

      const status = summarizeChecks(checks);
      if (status !== "PASS") {
        screenshot = path.join(SCREENSHOT_DIR, `${String(index + 1).padStart(2, "0")}-${capability.id}.png`);
        try { await harness.captureScreenshot(client, screenshot); } catch { screenshot = null; }
      }

      const result = {
        order: index + 1,
        id: capability.id,
        name: capability.name,
        kind: capability.kind,
        scope: capability.scope,
        route: capability.route,
        api: capability.api,
        apiSource: capability.apiSource,
        status,
        durationMs: Date.now() - startedAt,
        definition,
        checks,
        screenshot,
      };
      results.push(result);
      console.log(`${status}: ${Object.entries(checks).map(([name, value]) => `${name}=${value.status}`).join(" ")}`);
    }

    const totals = {
      capabilities: results.length,
      passed: results.filter(result => result.status === "PASS").length,
      failed: results.filter(result => result.status === "FAIL").length,
      blocked: results.filter(result => result.status === "BLOCKED").length,
      checkpoints: results.reduce((sum, result) => sum + Object.keys(result.checks).length, 0),
    };

    const report = {
      suite: "Avantiqo Finance 67-Capability End-to-End Acceptance Audit V2",
      parserVersion: "BALANCED_OBJECT_V2",
      generatedAt: new Date().toISOString(),
      nonDestructive: true,
      context,
      totals,
      results,
      acceptanceRule: "A capability passes only when every applicable checkpoint passes. Empty real-data workspaces remain BLOCKED rather than receiving a false pass.",
      reportPath: REPORT,
      screenshotDirectory: SCREENSHOT_DIR,
    };
    fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

    console.log("\n================ FINAL RESULT ================");
    console.log(`CAPABILITIES=${totals.capabilities}`);
    console.log(`PASS=${totals.passed}`);
    console.log(`FAIL=${totals.failed}`);
    console.log(`BLOCKED=${totals.blocked}`);
    console.log(`CHECKPOINTS=${totals.checkpoints}`);
    console.log(`REPORT=${REPORT}`);
    console.log(`SCREENSHOTS=${SCREENSHOT_DIR}`);
    process.exitCode = totals.failed === 0 && totals.blocked === 0 ? 0 : 1;
  } finally {
    cleanup();
  }
}

main().catch(error => {
  console.error("FINANCE 67-CAPABILITY E2E AUDIT V2 FAILED");
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
