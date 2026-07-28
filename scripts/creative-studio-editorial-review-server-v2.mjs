#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4317;
const MAX_BODY = 1_000_000;
const DECISIONS = new Set(["HOLD", "APPROVE", "REJECT"]);
const ROLES = new Set(["HERO_PERFORMANCE", "PERFORMANCE", "CONTEXT"]);
const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function browserClient() {
  let state = null;
  let timer = null;
  let saving = false;
  let again = false;
  const cards = () => [...document.querySelectorAll("article.card")];
  const idOf = (card) => card.querySelector("code")?.textContent?.trim() || "";
  const map = () => new Map((state?.range_decisions || []).map((row) => [row.moment_id, row]));

  function panel() {
    if (document.getElementById("review-save-panel")) return;
    const node = document.createElement("section");
    node.id = "review-save-panel";
    node.innerHTML = `
      <style>
      #review-save-panel{position:sticky;top:160px;z-index:9;margin:18px 0 28px;padding:16px;border:1px solid #d6a66a;border-radius:14px;background:rgba(9,9,11,.96);display:grid;grid-template-columns:220px 1fr auto;gap:14px;align-items:end}
      #review-save-panel label{display:grid;gap:7px;font-size:11px;color:#a9a099;text-transform:uppercase;letter-spacing:.08em}
      #review-save-panel select,#review-save-panel textarea{background:#050506;color:#f5ecdf;border:1px solid #2a2520;border-radius:9px;padding:10px;text-transform:none;letter-spacing:normal}
      #review-save-panel button{border-color:#d6a66a;background:#1b1510}#review-status,#review-summary{font-size:12px;margin-top:6px;color:#a9a099}
      article.card[data-decision="APPROVE"]{border-color:#6f9b73}article.card[data-decision="REJECT"]{border-color:#a45f5f;opacity:.72}article.card[data-decision="HOLD"]{border-color:#5a5045}
      @media(max-width:800px){#review-save-panel{position:relative;top:auto;grid-template-columns:1fr}}
      </style>
      <label>Overall decision<select id="overall-decision"><option>HOLD</option><option>APPROVE</option><option>REJECT</option></select></label>
      <label>Overall notes<textarea id="overall-notes" placeholder="Story, pacing and range notes"></textarea></label>
      <div><button id="save-decisions">Save decisions</button><div id="review-status">Loading...</div><div id="review-summary"></div></div>`;
    document.querySelector("main .notice")?.insertAdjacentElement("afterend", node);
  }

  function status(message, error = false) {
    const node = document.getElementById("review-status");
    if (node) {
      node.textContent = message;
      node.style.color = error ? "#d98282" : "#85b889";
    }
  }

  function summary() {
    const counts = (state?.range_decisions || []).reduce((out, row) => {
      out[row.decision] = (out[row.decision] || 0) + 1;
      return out;
    }, { APPROVE: 0, HOLD: 0, REJECT: 0 });
    const node = document.getElementById("review-summary");
    if (node) node.textContent = `Approved ${counts.APPROVE} | Hold ${counts.HOLD} | Rejected ${counts.REJECT}`;
  }

  function apply() {
    panel();
    document.getElementById("overall-decision").value = state.overall_decision || "HOLD";
    document.getElementById("overall-notes").value = state.notes || "";
    const rows = map();
    for (const card of cards()) {
      const row = rows.get(idOf(card));
      const decision = row?.decision || "HOLD";
      card.dataset.decision = decision;
      const selector = `input[type="radio"][value="${decision}"]`;
      const radio = card.querySelector(selector);
      if (radio) radio.checked = true;
      const notes = card.querySelector("textarea");
      if (notes) notes.value = row?.notes || "";
    }
    summary();
  }

  function collect() {
    const rows = map();
    for (const card of cards()) {
      const row = rows.get(idOf(card));
      if (!row) continue;
      row.decision = card.querySelector('input[type="radio"]:checked')?.value || "HOLD";
      row.notes = card.querySelector("textarea")?.value || "";
      row.allowed_roles = row.decision === "APPROVE"
        ? Number(card.dataset.hero || 0) === 1
          ? ["HERO_PERFORMANCE", "PERFORMANCE"]
          : ["PERFORMANCE"]
        : [];
      card.dataset.decision = row.decision;
    }
    state.overall_decision = document.getElementById("overall-decision").value;
    state.notes = document.getElementById("overall-notes").value;
    state.production_authorized = false;
    state.status = "DRAFT";
    summary();
    return state;
  }

  async function save() {
    if (!state) return;
    if (saving) { again = true; return; }
    saving = true; again = false; status("Saving...");
    try {
      const response = await fetch("/api/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(collect()),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Save failed ${response.status}`);
      state = payload.decisions;
      apply();
      status(`Saved ${new Date(payload.saved_at).toLocaleTimeString()}`);
    } catch (error) {
      status(error.message || String(error), true);
    } finally {
      saving = false;
      if (again) void save();
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void save(), 450);
  }

  async function start() {
    panel();
    try {
      const response = await fetch("/api/decisions", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Load failed");
      state = payload.decisions;
      apply();
      document.getElementById("save-decisions").addEventListener("click", () => void save());
      document.getElementById("overall-decision").addEventListener("change", schedule);
      document.getElementById("overall-notes").addEventListener("input", schedule);
      for (const card of cards()) {
        card.querySelectorAll('input[type="radio"]').forEach((radio) => radio.addEventListener("change", schedule));
        card.querySelector("textarea")?.addEventListener("input", schedule);
      }
      status("Saved decisions loaded");
    } catch (error) {
      status(error.message || String(error), true);
    }
  }
  void start();
}

const client = Buffer.from(`(${browserClient.toString()})();\n`);
const packageDir = path.resolve(text(process.env.COLE_APPROVAL_PACKAGE_DIR || process.argv[2]));
if (!packageDir) throw new Error("COLE_APPROVAL_PACKAGE_DIR_REQUIRED");
const port = Math.max(1, Math.floor(finite(process.env.COLE_APPROVAL_REVIEW_PORT || process.argv[3], DEFAULT_PORT)));
const files = {
  index: path.join(packageDir, "index.html"),
  manifest: path.join(packageDir, "manifest.json"),
  decisions: path.join(packageDir, "approval-decisions.json"),
  backups: path.join(packageDir, ".review-backups"),
  audit: path.join(packageDir, "review-audit-log.ndjson"),
};
const [manifest, initial] = await Promise.all([
  fs.readFile(files.manifest, "utf8").then(JSON.parse),
  fs.readFile(files.decisions, "utf8").then(JSON.parse),
]);
if (!Array.isArray(manifest.moments) || !manifest.moments.length) throw new Error("EDITORIAL_MANIFEST_MOMENTS_REQUIRED");
if (manifest.production_started === true || manifest.human_approval_required !== true) throw new Error("EDITORIAL_PACKAGE_LOCK_REQUIRED");

function normalize(input) {
  if (input.creative_project_id !== manifest.creative_project_id) throw new Error("EDITORIAL_DECISION_PROJECT_MISMATCH");
  if (input.production_authorized === true) throw new Error("REVIEW_SERVER_CANNOT_AUTHORIZE_PRODUCTION");
  const overall = text(input.overall_decision).toUpperCase();
  if (!DECISIONS.has(overall)) throw new Error("EDITORIAL_OVERALL_DECISION_INVALID");
  const byId = new Map(manifest.moments.map((moment) => [String(moment.id), moment]));
  const rows = Array.isArray(input.range_decisions) ? input.range_decisions : [];
  if (rows.length !== byId.size) throw new Error("EDITORIAL_DECISION_RANGE_COUNT_MISMATCH");
  const seen = new Set();
  const rangeDecisions = rows.map((entry) => {
    const id = String(entry?.moment_id || "");
    if (!byId.has(id) || seen.has(id)) throw new Error(`EDITORIAL_DECISION_RANGE_INVALID:${id}`);
    seen.add(id);
    const decision = text(entry.decision).toUpperCase();
    if (!DECISIONS.has(decision)) throw new Error(`EDITORIAL_RANGE_DECISION_INVALID:${id}`);
    const roles = Array.isArray(entry.allowed_roles) ? [...new Set(entry.allowed_roles.map((role) => text(role).toUpperCase()))] : [];
    if (roles.some((role) => !ROLES.has(role)) || (decision !== "APPROVE" && roles.length)) throw new Error(`EDITORIAL_ALLOWED_ROLE_INVALID:${id}`);
    return {
      moment_id: id,
      review_number: finite(byId.get(id)?.review_number, null),
      candidate_rank: finite(byId.get(id)?.candidate_rank, null),
      decision,
      allowed_roles: roles,
      notes: text(entry.notes),
    };
  });
  return {
    package_version: text(input.package_version || manifest.package_version),
    creative_project_id: manifest.creative_project_id,
    status: "DRAFT",
    approved_by: null,
    approved_at: null,
    overall_decision: overall,
    story_structure_decision: DECISIONS.has(text(input.story_structure_decision).toUpperCase()) ? text(input.story_structure_decision).toUpperCase() : "HOLD",
    production_authorized: false,
    notes: text(input.notes),
    range_decisions: rangeDecisions,
    last_saved_at: new Date().toISOString(),
    saved_by: "LOCAL_EDITORIAL_REVIEW_SERVER_V2",
  };
}
let decisions = normalize(initial);

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function save(value) {
  await fs.mkdir(files.backups, { recursive: true });
  const old = await fs.readFile(files.decisions, "utf8").catch(() => null);
  if (old !== null) await fs.writeFile(path.join(files.backups, `approval-decisions-${stamp()}.json`), old);
  const temporary = `${files.decisions}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, json(value));
  await fs.rename(temporary, files.decisions);
  const counts = value.range_decisions.reduce((out, row) => {
    out[row.decision] = (out[row.decision] || 0) + 1;
    return out;
  }, { APPROVE: 0, HOLD: 0, REJECT: 0 });
  await fs.appendFile(files.audit, `${JSON.stringify({ saved_at: value.last_saved_at, sha256: digest(value), counts, production_authorized: false })}\n`);
}

function mime(file) {
  return ({
    ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4",
  })[path.extname(file).toLowerCase()] || "application/octet-stream";
}

const root = `${packageDir}${path.sep}`;
const server = http.createServer(async (request, response) => {
  try {
    const host = text(request.headers.host).toLowerCase();
    if (host && !host.startsWith("127.0.0.1:") && !host.startsWith("localhost:")) return send(response, 403, "LOCAL_REVIEW_HOST_REQUIRED");
    const url = new URL(request.url || "/", `http://${host || `${HOST}:${port}`}`);
    if (url.pathname === "/review-client.js") return send(response, 200, client, "text/javascript; charset=utf-8");
    if (url.pathname === "/api/decisions") {
      if (request.method === "GET") {
        decisions = normalize(JSON.parse(await fs.readFile(files.decisions, "utf8")));
        return send(response, 200, Buffer.from(JSON.stringify({ decisions })), "application/json; charset=utf-8");
      }
      if (request.method === "POST") {
        if (!text(request.headers["content-type"]).toLowerCase().startsWith("application/json")) return send(response, 415, "APPLICATION_JSON_REQUIRED");
        decisions = normalize(JSON.parse(await body(request)));
        await save(decisions);
        return send(response, 200, Buffer.from(JSON.stringify({ saved_at: decisions.last_saved_at, decisions })), "application/json; charset=utf-8");
      }
      return send(response, 405, "METHOD_NOT_ALLOWED");
    }
    if (!["GET", "HEAD"].includes(request.method || "GET")) return send(response, 405, "METHOD_NOT_ALLOWED");
    const relative = decodeURIComponent(url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, ""));
    const file = path.resolve(packageDir, relative);
    if (file !== packageDir && !file.startsWith(root)) return send(response, 403, "PATH_NOT_ALLOWED");
    let output = await fs.readFile(file);
    if (file === files.index) {
      const html = output.toString("utf8");
      const marker = '<script src="/review-client.js"></script>';
      output = Buffer.from(html.includes(marker) ? html : html.replace("</body>", `${marker}\n</body>`));
    }
    return send(response, 200, output, mime(file), request.method === "HEAD");
  } catch (error) {
    if (error?.code === "ENOENT") return send(response, 404, "NOT_FOUND");
    console.error(error);
    return send(response, 500, Buffer.from(JSON.stringify({ error: error?.message || String(error) })), "application/json; charset=utf-8");
  }
});

function send(response, status, value, type = "text/plain; charset=utf-8", head = false) {
  const output = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  response.writeHead(status, { "content-type": type, "content-length": output.length, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(head ? undefined : output);
}

server.listen(port, HOST, () => {
  const actual = server.address()?.port || port;
  const url = `http://${HOST}:${actual}/`;
  console.log("============================================================");
  console.log("AVANTIQO LOCAL EDITORIAL REVIEW SERVER V2");
  console.log("============================================================");
  console.log(`PACKAGE_DIR=${packageDir}`);
  console.log(`REVIEW_URL=${url}`);
  console.log(`DECISIONS_FILE=${files.decisions}`);
  console.log(`AUDIT_LOG=${files.audit}`);
  console.log("CLIENT_SCRIPT_DELIVERY=SEPARATE_ENDPOINT");
  console.log("DECISIONS_PERSIST_LOCALLY=YES");
  console.log("DATABASE_WRITES=0");
  console.log("PROVIDER_CALLS=0");
  console.log("WALLET_CHARGES=0");
  console.log("PRODUCTION_AUTHORIZATION_ALLOWED=NO");
  console.log("Press Control-C after review.");
  console.log("============================================================");
  if (process.platform === "darwin" && process.env.COLE_APPROVAL_AUTO_OPEN !== "NO") {
    const opener = spawn("open", [url], { detached: true, stdio: "ignore" });
    opener.unref();
  }
});

function stop(signal) {
  console.log(`\nREVIEW_SERVER_SHUTDOWN_SIGNAL=${signal}`);
  server.close(() => { console.log("REVIEW_SERVER_STOPPED=YES"); process.exit(0); });
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
