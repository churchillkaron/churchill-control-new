#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4317;
const MAX_BODY_BYTES = 1_000_000;
const DECISION_VALUES = new Set(["HOLD", "APPROVE", "REJECT"]);
const ROLE_VALUES = new Set(["HERO_PERFORMANCE", "PERFORMANCE", "CONTEXT"]);

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".m4v": "video/x-m4v",
    ".mov": "video/quicktime",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
  }[extension] || "application/octet-stream";
}

function sendJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function sendText(response, status, body) {
  const buffer = Buffer.from(body);
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": buffer.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(buffer);
}

function clientScript() {
  return String.raw`
<script id="avantiqo-review-persistence">
(() => {
  const DECISIONS_URL = "/api/decisions";
  let state = null;
  let saveTimer = null;
  let saving = false;
  let pendingSave = false;

  function momentIdForCard(card) {
    return card.querySelector("code")?.textContent?.trim() || "";
  }

  function cardMap() {
    return new Map(
      [...document.querySelectorAll("article.card")]
        .map((card) => [momentIdForCard(card), card])
        .filter(([id]) => id)
    );
  }

  function decisionMap() {
    return new Map((state?.range_decisions || []).map((entry) => [entry.moment_id, entry]));
  }

  function ensurePanel() {
    if (document.getElementById("review-save-panel")) return;
    const panel = document.createElement("section");
    panel.id = "review-save-panel";
    panel.innerHTML = `
      <style>
        #review-save-panel{position:sticky;top:164px;z-index:9;margin:18px 0 28px;padding:16px 18px;border:1px solid #d6a66a;border-radius:14px;background:rgba(9,9,11,.96);backdrop-filter:blur(14px);display:grid;grid-template-columns:minmax(180px,260px) 1fr auto;gap:14px;align-items:end}
        #review-save-panel label{display:grid;gap:7px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#a9a099}
        #review-save-panel select,#review-save-panel textarea{width:100%;background:#050506;color:#f5ecdf;border:1px solid #2a2520;border-radius:9px;padding:10px;text-transform:none;letter-spacing:normal}
        #review-save-panel textarea{min-height:42px;resize:vertical}
        #review-save-panel button{border-color:#d6a66a;background:#1b1510}
        #review-save-status{font-size:12px;color:#a9a099;margin-top:7px}
        #review-decision-summary{font-size:12px;color:#d6a66a;margin-top:5px}
        article.card[data-decision="APPROVE"]{border-color:#6f9b73;box-shadow:0 0 0 1px rgba(111,155,115,.25)}
        article.card[data-decision="REJECT"]{border-color:#a45f5f;opacity:.72}
        article.card[data-decision="HOLD"]{border-color:#5a5045}
        @media(max-width:800px){#review-save-panel{position:relative;top:auto;grid-template-columns:1fr}}
      </style>
      <label>Overall review decision
        <select id="overall-review-decision">
          <option value="HOLD">Hold</option>
          <option value="APPROVE">Approve selected ranges</option>
          <option value="REJECT">Reject package</option>
        </select>
      </label>
      <label>Overall notes
        <textarea id="overall-review-notes" placeholder="Story, pacing, performance or range notes"></textarea>
      </label>
      <div>
        <button id="save-review-decisions" type="button">Save decisions</button>
        <div id="review-save-status">Loading saved decisions…</div>
        <div id="review-decision-summary"></div>
      </div>
    `;
    const notice = document.querySelector("main .notice");
    if (notice) notice.insertAdjacentElement("afterend", panel);
    else document.querySelector("main")?.prepend(panel);
  }

  function status(message, kind = "normal") {
    const node = document.getElementById("review-save-status");
    if (!node) return;
    node.textContent = message;
    node.style.color = kind === "error" ? "#d98282" : kind === "saved" ? "#85b889" : "#a9a099";
  }

  function updateSummary() {
    const decisions = state?.range_decisions || [];
    const counts = decisions.reduce((result, entry) => {
      result[entry.decision] = (result[entry.decision] || 0) + 1;
      return result;
    }, { APPROVE: 0, HOLD: 0, REJECT: 0 });
    const node = document.getElementById("review-decision-summary");
    if (node) node.textContent = `Approved ${counts.APPROVE} · Hold ${counts.HOLD} · Rejected ${counts.REJECT}`;
  }

  function applyStateToPage() {
    ensurePanel();
    const overall = document.getElementById("overall-review-decision");
    const notes = document.getElementById("overall-review-notes");
    if (overall) overall.value = state?.overall_decision || "HOLD";
    if (notes) notes.value = state?.notes || "";

    const decisions = decisionMap();
    for (const [id, card] of cardMap()) {
      const entry = decisions.get(id);
      const decision = entry?.decision || "HOLD";
      card.dataset.decision = decision;
      const radio = card.querySelector(`input[type="radio"][value="${decision}"]`);
      if (radio) radio.checked = true;
      const textarea = card.querySelector("textarea");
      if (textarea) textarea.value = entry?.notes || "";
    }
    updateSummary();
  }

  function collectPageState() {
    const decisions = decisionMap();
    for (const [id, card] of cardMap()) {
      const entry = decisions.get(id);
      if (!entry) continue;
      const selected = card.querySelector('input[type="radio"]:checked')?.value || "HOLD";
      entry.decision = selected;
      entry.notes = card.querySelector("textarea")?.value || "";
      const hasHero = Number(card.dataset.hero || 0) === 1;
      entry.allowed_roles = selected === "APPROVE"
        ? hasHero
          ? ["HERO_PERFORMANCE", "PERFORMANCE"]
          : ["PERFORMANCE"]
        : [];
      card.dataset.decision = selected;
    }
    state.overall_decision = document.getElementById("overall-review-decision")?.value || "HOLD";
    state.notes = document.getElementById("overall-review-notes")?.value || "";
    state.status = "DRAFT";
    state.production_authorized = false;
    state.approved_by = null;
    state.approved_at = null;
    updateSummary();
    return state;
  }

  async function save() {
    if (!state) return;
    if (saving) {
      pendingSave = true;
      return;
    }
    saving = true;
    pendingSave = false;
    status("Saving…");
    try {
      const response = await fetch(DECISIONS_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(collectPageState()),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Save failed ${response.status}`);
      state = payload.decisions;
      applyStateToPage();
      status(`Saved locally ${new Date(payload.saved_at).toLocaleTimeString()}`, "saved");
    } catch (error) {
      status(error.message || String(error), "error");
    } finally {
      saving = false;
      if (pendingSave) void save();
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(), 450);
  }

  function bind() {
    document.getElementById("save-review-decisions")?.addEventListener("click", () => void save());
    document.getElementById("overall-review-decision")?.addEventListener("change", scheduleSave);
    document.getElementById("overall-review-notes")?.addEventListener("input", scheduleSave);
    for (const card of document.querySelectorAll("article.card")) {
      for (const radio of card.querySelectorAll('input[type="radio"]')) {
        radio.addEventListener("change", scheduleSave);
      }
      card.querySelector("textarea")?.addEventListener("input", scheduleSave);
    }
  }

  async function start() {
    ensurePanel();
    try {
      const response = await fetch(DECISIONS_URL, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load decisions");
      state = payload.decisions;
      applyStateToPage();
      bind();
      status("Saved decisions loaded", "saved");
    } catch (error) {
      status(error.message || String(error), "error");
    }
  }

  void start();
})();
</script>`;
}

function injectPersistence(html) {
  if (html.includes('id="avantiqo-review-persistence"')) return html;
  const script = clientScript();
  return html.includes("</body>")
    ? html.replace("</body>", `${script}\n</body>`)
    : `${html}\n${script}`;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function validatePackage(manifest, decisions) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("EDITORIAL_MANIFEST_REQUIRED");
  }
  if (!Array.isArray(manifest.moments) || manifest.moments.length === 0) {
    throw new Error("EDITORIAL_MANIFEST_MOMENTS_REQUIRED");
  }
  if (manifest.production_started === true) {
    throw new Error("EDITORIAL_PACKAGE_ALREADY_IN_PRODUCTION");
  }
  if (manifest.human_approval_required !== true) {
    throw new Error("EDITORIAL_HUMAN_APPROVAL_GATE_REQUIRED");
  }
  if (!decisions || typeof decisions !== "object") {
    throw new Error("EDITORIAL_DECISIONS_REQUIRED");
  }
  if (decisions.creative_project_id !== manifest.creative_project_id) {
    throw new Error("EDITORIAL_DECISION_PROJECT_MISMATCH");
  }
  const manifestIds = new Set(manifest.moments.map((moment) => String(moment.id)));
  const decisionIds = new Set(
    (Array.isArray(decisions.range_decisions) ? decisions.range_decisions : [])
      .map((entry) => String(entry.moment_id)),
  );
  if (manifestIds.size !== decisionIds.size) {
    throw new Error("EDITORIAL_DECISION_RANGE_COUNT_MISMATCH");
  }
  for (const id of manifestIds) {
    if (!decisionIds.has(id)) {
      throw new Error(`EDITORIAL_DECISION_RANGE_MISSING:${id}`);
    }
  }
}

function validateSavedDecisions(input, manifest) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("EDITORIAL_DECISION_PAYLOAD_INVALID");
  }
  if (input.creative_project_id !== manifest.creative_project_id) {
    throw new Error("EDITORIAL_DECISION_PROJECT_MISMATCH");
  }
  if (input.production_authorized === true) {
    throw new Error("REVIEW_SERVER_CANNOT_AUTHORIZE_PRODUCTION");
  }
  if (!DECISION_VALUES.has(text(input.overall_decision).toUpperCase())) {
    throw new Error("EDITORIAL_OVERALL_DECISION_INVALID");
  }
  const manifestById = new Map(
    manifest.moments.map((moment) => [String(moment.id), moment]),
  );
  const rows = Array.isArray(input.range_decisions) ? input.range_decisions : [];
  if (rows.length !== manifestById.size) {
    throw new Error("EDITORIAL_DECISION_RANGE_COUNT_MISMATCH");
  }
  const seen = new Set();
  const normalizedRows = rows.map((entry) => {
    const id = String(entry?.moment_id || "");
    if (!manifestById.has(id)) {
      throw new Error(`EDITORIAL_DECISION_UNKNOWN_RANGE:${id}`);
    }
    if (seen.has(id)) {
      throw new Error(`EDITORIAL_DECISION_DUPLICATE_RANGE:${id}`);
    }
    seen.add(id);
    const decision = text(entry.decision).toUpperCase();
    if (!DECISION_VALUES.has(decision)) {
      throw new Error(`EDITORIAL_RANGE_DECISION_INVALID:${id}`);
    }
    const allowedRoles = Array.isArray(entry.allowed_roles)
      ? [...new Set(entry.allowed_roles.map((role) => text(role).toUpperCase()))]
      : [];
    if (allowedRoles.some((role) => !ROLE_VALUES.has(role))) {
      throw new Error(`EDITORIAL_ALLOWED_ROLE_INVALID:${id}`);
    }
    if (decision !== "APPROVE" && allowedRoles.length) {
      throw new Error(`EDITORIAL_NON_APPROVED_RANGE_HAS_ROLES:${id}`);
    }
    return {
      moment_id: id,
      review_number: finite(manifestById.get(id)?.review_number, null),
      candidate_rank: finite(manifestById.get(id)?.candidate_rank, null),
      decision,
      allowed_roles: allowedRoles,
      notes: text(entry.notes),
    };
  });
  return {
    package_version: text(input.package_version || manifest.package_version),
    creative_project_id: manifest.creative_project_id,
    status: "DRAFT",
    approved_by: null,
    approved_at: null,
    overall_decision: text(input.overall_decision).toUpperCase(),
    story_structure_decision: DECISION_VALUES.has(
      text(input.story_structure_decision).toUpperCase(),
    ) ? text(input.story_structure_decision).toUpperCase() : "HOLD",
    production_authorized: false,
    notes: text(input.notes),
    range_decisions: normalizedRows,
    last_saved_at: new Date().toISOString(),
    saved_by: "LOCAL_EDITORIAL_REVIEW_SERVER",
  };
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("REQUEST_BODY_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function atomicSave({ decisionsPath, backupDir, auditPath, decisions }) {
  await fs.mkdir(backupDir, { recursive: true });
  const existing = await fs.readFile(decisionsPath, "utf8").catch(() => null);
  if (existing !== null) {
    await fs.writeFile(
      path.join(backupDir, `approval-decisions-${timestamp()}.json`),
      existing,
      "utf8",
    );
  }
  const temporaryPath = `${decisionsPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporaryPath, safeJson(decisions), "utf8");
  await fs.rename(temporaryPath, decisionsPath);
  const counts = decisions.range_decisions.reduce((result, entry) => {
    result[entry.decision] = (result[entry.decision] || 0) + 1;
    return result;
  }, { APPROVE: 0, HOLD: 0, REJECT: 0 });
  await fs.appendFile(
    auditPath,
    `${JSON.stringify({
      saved_at: decisions.last_saved_at,
      decisions_sha256: hash(decisions),
      overall_decision: decisions.overall_decision,
      counts,
      production_authorized: false,
    })}\n`,
    "utf8",
  );
}

const packageArgument = text(
  process.env.COLE_APPROVAL_PACKAGE_DIR || process.argv[2],
);
if (!packageArgument) {
  throw new Error("COLE_APPROVAL_PACKAGE_DIR_REQUIRED");
}

const packageDir = path.resolve(packageArgument);
const indexPath = path.join(packageDir, "index.html");
const manifestPath = path.join(packageDir, "manifest.json");
const decisionsPath = path.join(packageDir, "approval-decisions.json");
const backupDir = path.join(packageDir, ".review-backups");
const auditPath = path.join(packageDir, "review-audit-log.ndjson");
const requestedPort = Math.max(1, Math.floor(finite(
  process.env.COLE_APPROVAL_REVIEW_PORT || process.argv[3],
  DEFAULT_PORT,
)));

const [manifest, initialDecisions] = await Promise.all([
  readJson(manifestPath),
  readJson(decisionsPath),
]);
validatePackage(manifest, initialDecisions);

let decisions = validateSavedDecisions(initialDecisions, manifest);
const packageRootWithSeparator = `${packageDir}${path.sep}`;

const server = http.createServer(async (request, response) => {
  try {
    const host = text(request.headers.host).toLowerCase();
    if (
      host &&
      !host.startsWith("127.0.0.1:") &&
      !host.startsWith("localhost:")
    ) {
      sendText(response, 403, "LOCAL_REVIEW_HOST_REQUIRED");
      return;
    }

    const url = new URL(request.url || "/", `http://${host || `${HOST}:${requestedPort}`}`);

    if (url.pathname === "/api/decisions") {
      if (request.method === "GET") {
        decisions = validateSavedDecisions(await readJson(decisionsPath), manifest);
        sendJson(response, 200, { decisions });
        return;
      }
      if (request.method === "POST") {
        const origin = text(request.headers.origin);
        if (origin && ![
          `http://${HOST}:${server.address()?.port}`,
          `http://localhost:${server.address()?.port}`,
        ].includes(origin)) {
          sendJson(response, 403, { error: "LOCAL_REVIEW_ORIGIN_REQUIRED" });
          return;
        }
        const contentType = text(request.headers["content-type"]).toLowerCase();
        if (!contentType.startsWith("application/json")) {
          sendJson(response, 415, { error: "APPLICATION_JSON_REQUIRED" });
          return;
        }
        const input = JSON.parse(await readBody(request));
        const normalized = validateSavedDecisions(input, manifest);
        await atomicSave({
          decisionsPath,
          backupDir,
          auditPath,
          decisions: normalized,
        });
        decisions = normalized;
        sendJson(response, 200, {
          saved_at: normalized.last_saved_at,
          decisions: normalized,
        });
        return;
      }
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }

    if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
      sendText(response, 405, "METHOD_NOT_ALLOWED");
      return;
    }

    const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const relativePath = requestedPath.replace(/^\/+/, "");
    const filePath = path.resolve(packageDir, relativePath);
    if (filePath !== packageDir && !filePath.startsWith(packageRootWithSeparator)) {
      sendText(response, 403, "PATH_NOT_ALLOWED");
      return;
    }

    let body = await fs.readFile(filePath);
    if (filePath === indexPath) {
      body = Buffer.from(injectPersistence(body.toString("utf8")));
    }

    response.writeHead(200, {
      "content-type": mimeType(filePath),
      "content-length": body.length,
      "cache-control": filePath === indexPath ? "no-store" : "public, max-age=3600",
      "accept-ranges": "bytes",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    });
    if (request.method === "HEAD") response.end();
    else response.end(body);
  } catch (error) {
    if (error?.code === "ENOENT") {
      sendText(response, 404, "NOT_FOUND");
      return;
    }
    console.error(error);
    sendJson(response, 500, { error: error?.message || String(error) });
  }
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(requestedPort, HOST, () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  const reviewUrl = `http://${HOST}:${port}/`;
  console.log("============================================================");
  console.log("AVANTIQO LOCAL EDITORIAL REVIEW SERVER");
  console.log("============================================================");
  console.log(`PACKAGE_DIR=${packageDir}`);
  console.log(`REVIEW_URL=${reviewUrl}`);
  console.log(`DECISIONS_FILE=${decisionsPath}`);
  console.log(`AUDIT_LOG=${auditPath}`);
  console.log("DECISIONS_PERSIST_LOCALLY=YES");
  console.log("DATABASE_WRITES=0");
  console.log("PROVIDER_CALLS=0");
  console.log("WALLET_CHARGES=0");
  console.log("PRODUCTION_AUTHORIZATION_ALLOWED=NO");
  console.log("Press Control-C after completing the review.");
  console.log("============================================================");

  if (process.platform === "darwin" && process.env.COLE_APPROVAL_AUTO_OPEN !== "NO") {
    const opener = spawn("open", [reviewUrl], {
      detached: true,
      stdio: "ignore",
    });
    opener.unref();
  }
});

function shutdown(signal) {
  console.log(`\nREVIEW_SERVER_SHUTDOWN_SIGNAL=${signal}`);
  server.close(() => {
    console.log("REVIEW_SERVER_STOPPED=YES");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
