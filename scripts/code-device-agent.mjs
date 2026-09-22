#!/usr/bin/env node
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rm, readdir, stat } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_DEVICE_AGENT_V1";
const HOME = path.join(os.homedir(), ".avantiqo");
const CONFIG = process.env.AVANTIQO_CODE_DEVICE_CONFIG || path.join(HOME, "code-device.json");
const SESSIONS = path.join(HOME, "code-device-sessions");
const CAPABILITIES = ["code.workspace", "code.terminal", "code.browser.verify"];
const MAX_OUTPUT = 40000;
const MAX_FILE = 512 * 1024;
const MAX_PATCH = 768 * 1024;
const BLOCKED = new Set(["curl","wget","ssh","scp","rsync","psql","vercel","supabase","bash","sh","zsh","fish","env","xargs"]);

function text(v, n=4000){return String(v??"").trim().slice(0,n)}
async function loadPublicLocalEnvFallback(){
  if ((process.env.AVANTIQO_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && (process.env.AVANTIQO_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) return;
  try {
    const raw = await readFile(path.join(process.cwd(), ".env.local"), "utf8");
    const allowed = new Set(["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","AVANTIQO_SUPABASE_URL","AVANTIQO_SUPABASE_PUBLISHABLE_KEY"]);
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || !allowed.has(match[1]) || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
      process.env[match[1]] = value;
    }
  } catch {}
}
function bounded(v,n=MAX_OUTPUT){const s=String(v??"");return s.length<=n?s:`${s.slice(0,n)}\n...[truncated ${s.length-n} chars]`}
function apiBase(){return text(process.env.AVANTIQO_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/,'')}
function apiKey(){return text(process.env.AVANTIQO_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,5000)}
function headers(){const key=apiKey();if(!key)throw new Error("AVANTIQO_CODE_DEVICE_SUPABASE_KEY_REQUIRED");return{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"}}
async function rpc(name,body){const base=apiBase();if(!base)throw new Error("AVANTIQO_CODE_DEVICE_SUPABASE_URL_REQUIRED");const r=await fetch(`${base}/rest/v1/rpc/${name}`,{method:"POST",headers:headers(),body:JSON.stringify(body)});const raw=await r.text();if(!r.ok)throw new Error(`AVANTIQO_CODE_DEVICE_RPC_FAILED:${name}:${r.status}:${raw.slice(0,500)}`);return raw?JSON.parse(raw):null}
async function loadConfig(){return JSON.parse(await readFile(CONFIG,"utf8"))}
async function saveConfig(v){await mkdir(HOME,{recursive:true});await writeFile(CONFIG,JSON.stringify(v,null,2)+"\n",{mode:0o600})}
function rel(value){const s=text(value,2000).replaceAll("\\","/");if(!s||s.startsWith("/")||s.includes("\0"))throw new Error("CODE_DEVICE_PATH_INVALID");const n=path.posix.normalize(s);if(n==="."||n.startsWith("../")||n.includes("/../"))throw new Error("CODE_DEVICE_PATH_INVALID");if(n===".git"||n.startsWith(".git/")||/(^|\/)\.env(?:\.|$)/i.test(n))throw new Error("CODE_DEVICE_PROTECTED_PATH");return n}
function commandGuard(command,args=[]){const c=path.basename(text(command,160)).toLowerCase();if(!c||BLOCKED.has(c))throw new Error("CODE_DEVICE_COMMAND_BLOCKED");const a=(Array.isArray(args)?args:[]).map(String);if(c==="git"&&a.some(x=>x.toLowerCase()==="push"))throw new Error("CODE_DEVICE_GIT_PUSH_REQUIRES_GOVERNED_COMMIT");if(c==="git"&&a.some(x=>x.toLowerCase()==="clean"))throw new Error("CODE_DEVICE_GIT_CLEAN_BLOCKED");const joined=`${c} ${a.join(" ")}`.toLowerCase();for(const token of ["deploy --prod","--prod"," publish"," release","db:push","db push","migrate:up","migration:up","remote set-url"]){if(joined.includes(token))throw new Error("CODE_DEVICE_EXTERNAL_SIDE_EFFECT_REQUIRES_GOVERNED_RUNTIME")}}
async function run(command,args=[],cwd,timeout=20*60*1000){commandGuard(command,args);return await new Promise((resolve,reject)=>{const child=spawn(command,args.map(String),{cwd,env:process.env,stdio:["ignore","pipe","pipe"],shell:false});let out="",err="",done=false;const timer=setTimeout(()=>{if(done)return;child.kill("SIGTERM");setTimeout(()=>child.kill("SIGKILL"),1500).unref()},Math.max(30000,Math.min(timeout,2*60*60*1000)));child.stdout.on("data",c=>out+=c);child.stderr.on("data",c=>err+=c);child.on("error",e=>{if(done)return;done=true;clearTimeout(timer);reject(e)});child.on("close",code=>{if(done)return;done=true;clearTimeout(timer);resolve({command,args,cwd,exit_code:Number.isInteger(code)?code:124,stdout:bounded(out),stderr:bounded(err)})})})}
async function required(command,args,cwd,prefix){const r=await run(command,args,cwd);if(r.exit_code!==0){const e=new Error(`${prefix}:${command}:${r.exit_code}`);e.details=r;throw e}return r}
async function origin(root){return text((await required("git",["remote","get-url","origin"],root,"CODE_DEVICE_GIT_ORIGIN_FAILED")).stdout,2000).replace(/\.git$/i,"")}
async function isDir(p){try{return (await stat(p)).isDirectory()}catch{return false}}
async function findRepository(repositoryUrl,roots){for(const root of roots){const resolved=path.resolve(root);if(await isDir(path.join(resolved,".git"))){if(await origin(resolved).catch(()=>null)===repositoryUrl)return resolved}let entries=[];try{entries=await readdir(resolved,{withFileTypes:true})}catch{continue}for(const e of entries.slice(0,250)){if(!e.isDirectory())continue;const candidate=path.join(resolved,e.name);if(!(await isDir(path.join(candidate,".git"))))continue;if(await origin(candidate).catch(()=>null)===repositoryUrl)return candidate}}throw new Error("CODE_DEVICE_REPOSITORY_NOT_FOUND_IN_ALLOWED_ROOTS")}
function sessionFile(id){return path.join(SESSIONS,`${id}.json`)}
async function saveSession(v){await mkdir(SESSIONS,{recursive:true});await writeFile(sessionFile(v.session_id),JSON.stringify(v,null,2)+"\n",{mode:0o600})}
async function loadSession(id){const s=JSON.parse(await readFile(sessionFile(text(id,240)),"utf8"));if(!s?.workspace_root||!s?.source_root)throw new Error("CODE_DEVICE_SESSION_INVALID");return s}
async function inspect(root){const [head,status,tracked]=await Promise.all([required("git",["rev-parse","HEAD"],root,"CODE_DEVICE_HEAD_FAILED"),required("git",["status","--porcelain=v1"],root,"CODE_DEVICE_STATUS_FAILED"),required("git",["ls-files"],root,"CODE_DEVICE_TRACKED_FAILED")]);const files=tracked.stdout.split("\n").map((item) => text(item)).filter(Boolean);return{head_sha:text(head.stdout,160),clean:!text(status.stdout),tracked_file_count:files.length,tracked_files_sample:files.slice(0,200),local_computer:true,device_agent:true}}
async function diff(root){const untracked=await required("git",["ls-files","--others","--exclude-standard","-z"],root,"CODE_DEVICE_UNTRACKED_FAILED");for(const p of untracked.stdout.split("\0").map((item) => text(item)).filter(Boolean)){await required("git",["add","-N","--",rel(p)],root,"CODE_DEVICE_INTENT_ADD_FAILED")}const [status,d,check]=await Promise.all([required("git",["status","--porcelain=v1"],root,"CODE_DEVICE_STATUS_FAILED"),required("git",["diff","--binary","--no-ext-diff"],root,"CODE_DEVICE_DIFF_FAILED"),run("git",["diff","--check"],root)]);if(Buffer.byteLength(d.stdout,"utf8")>MAX_PATCH)throw new Error("CODE_DEVICE_PATCH_TOO_LARGE");return{status:status.stdout.split("\n").map((item) => text(item)).filter(Boolean),patch:d.stdout,patch_bytes:Buffer.byteLength(d.stdout,"utf8"),diff_check:check}}
async function readRepo(root,input={}){const p=rel(input.file_path);const b=await readFile(path.join(root,p));if(b.length>MAX_FILE)throw new Error("CODE_DEVICE_FILE_TOO_LARGE");const lines=b.toString("utf8").split("\n");const start=Math.max(1,Number(input.start_line)||1);const end=input.end_line==null?Math.min(lines.length,start+399):Math.min(lines.length,Math.max(start,Number(input.end_line)||start));return{file_path:p,start_line:start,end_line:end,total_lines:lines.length,content:lines.slice(start-1,end).join("\n")}}
async function applyFiles(root,files=[]){if(!Array.isArray(files)||!files.length||files.length>30)throw new Error("CODE_DEVICE_FILES_INVALID");const written=[];for(const f of files){const p=rel(f.path);const b=Buffer.from(String(f.content??""));if(b.length>MAX_FILE)throw new Error("CODE_DEVICE_FILE_WRITE_TOO_LARGE");const full=path.join(root,p);await mkdir(path.dirname(full),{recursive:true});await writeFile(full,b);written.push({path:p,bytes:b.length})}const check=await run("git",["diff","--check"],root);return{written,diff_check:check,valid:check.exit_code===0}}
async function searchRepo(root,input={}){const mode=text(input.mode||"literal",40).toLowerCase(),q=text(input.query,4000);if(!["literal","regex","path","glob"].includes(mode))throw new Error("CODE_DEVICE_SEARCH_MODE_INVALID");if(mode==="path"||mode==="glob"){const tracked=(await required("git",["ls-files"],root,"CODE_DEVICE_SEARCH_FAILED")).stdout.split("\n").map((item) => text(item)).filter(Boolean);const patterns=(mode==="glob"&&Array.isArray(input.path_globs)?input.path_globs:[q]).map(x=>text(x,1000)).filter(Boolean);const matches=tracked.filter(p=>mode==="path"?p.toLowerCase().includes(patterns[0].toLowerCase()):patterns.some(g=>new RegExp("^"+g.replace(/[.+^${}()|[\]\\]/g,"\\$&").replace(/\*\*/g,".*").replace(/\*/g,"[^/]*").replace(/\?/g,".")+"$").test(p)));return{mode,query:q,match_count:matches.length,truncated:matches.length>250,matches:matches.slice(0,250)}}if(!q)throw new Error("CODE_DEVICE_SEARCH_QUERY_REQUIRED");const args=["grep","-n","-I",mode==="literal"?"-F":"-E","--",q,...(Array.isArray(input.paths)&&input.paths.length?input.paths.map(rel):["."])];const r=await run("git",args,root);if(![0,1].includes(r.exit_code))throw new Error("CODE_DEVICE_SEARCH_FAILED");const matches=r.stdout.split("\n").map(x=>text(x,4000)).filter(Boolean);return{mode,query:q,match_count:matches.length,truncated:matches.length>250,matches:matches.slice(0,250)}}
async function waitForHttp(url, timeoutMs = 45000) {
  const deadline = Date.now() + Math.max(5000, Math.min(Number(timeoutMs) || 45000, 120000));
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0 && response.status < 600) return true;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`CODE_DEVICE_BROWSER_SERVER_NOT_READY:${text(lastError?.message || "timeout", 300)}`);
}

async function browserVerify(root, input = {}) {
  const url = text(input.url, 2000);
  if (
    !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(url) &&
    !/^https:\/\//i.test(url)
  ) throw new Error("CODE_DEVICE_BROWSER_URL_INVALID");

  let chromium;
  try { ({ chromium } = await import("playwright-core")); }
  catch { throw new Error("CODE_DEVICE_PLAYWRIGHT_CORE_REQUIRED"); }

  let server = null;
  const serverSpec = input.server && typeof input.server === "object" ? input.server : null;
  if (serverSpec?.command) {
    const command = text(serverSpec.command, 160);
    const args = Array.isArray(serverSpec.args) ? serverSpec.args.map(String) : [];
    commandGuard(command, args);
    const relativeCwd = serverSpec.cwd && serverSpec.cwd !== "." ? rel(serverSpec.cwd) : "";
    const cwd = relativeCwd ? path.join(root, relativeCwd) : root;
    if (cwd !== root && !cwd.startsWith(root + path.sep)) throw new Error("CODE_DEVICE_CWD_OUTSIDE_WORKTREE");
    server = spawn(command, args, { cwd, env: process.env, stdio: "ignore", shell: false });
    server.unref();
    await waitForHttp(text(serverSpec.ready_url, 2000) || url, serverSpec.ready_timeout_ms || 60000);
  }

  const candidates = process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    : process.platform === "win32"
      ? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"]
      : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  let executablePath = null;
  for (const candidate of candidates) {
    try { if ((await stat(candidate)).isFile()) { executablePath = candidate; break; } } catch {}
  }

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 1000)); });
    page.on("pageerror", (error) => pageErrors.push(String(error.message || error).slice(0, 1000)));
    page.on("requestfailed", (request) => failedRequests.push({ url: request.url().slice(0, 1000), error: request.failure()?.errorText || "failed" }));
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: Math.min(Number(input.timeout_ms) || 45000, 120000) });
    if (input.selector) await page.locator(String(input.selector)).first().waitFor({ state: "visible", timeout: 15000 });
    const replaySteps = Array.isArray(input.steps) ? input.steps.slice(0, 24) : [];
    const replayResults = [];
    for (let index = 0; index < replaySteps.length; index += 1) {
      const step = replaySteps[index] && typeof replaySteps[index] === "object" ? replaySteps[index] : {};
      const action = text(step.action, 80).toLowerCase();
      const selector = text(step.selector, 1200);
      if (!selector) throw new Error(`CODE_DEVICE_BROWSER_STEP_SELECTOR_REQUIRED:${index + 1}`);
      const locator = page.locator(selector).first();
      if (action === "click") await locator.click({ timeout: 15000 });
      else if (action === "fill") await locator.fill(String(step.value ?? ""), { timeout: 15000 });
      else if (action === "press") await locator.press(text(step.key, 80) || "Enter", { timeout: 15000 });
      else if (action === "check") await locator.check({ timeout: 15000 });
      else if (action === "select") await locator.selectOption(String(step.value ?? ""), { timeout: 15000 });
      else if (action === "assert_visible") await locator.waitFor({ state: "visible", timeout: 15000 });
      else if (action === "assert_text") {
        const actual = text(await locator.textContent(), 4000);
        const expected = text(step.text, 4000);
        if (!actual.includes(expected)) throw new Error(`CODE_DEVICE_BROWSER_STEP_TEXT_MISMATCH:${index + 1}`);
      } else throw new Error(`CODE_DEVICE_BROWSER_STEP_ACTION_INVALID:${action || index + 1}`);
      if (step.wait_for_network_idle === true) await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => null);
      replayResults.push({ id: text(step.id, 160) || `S${index + 1}`, action, selector, passed: true });
    }
    const title = await page.title();
    const proofDir = path.join(HOME, "code-device-proofs");
    await mkdir(proofDir, { recursive: true });
    const screenshotPath = path.join(proofDir, `browser-${crypto.randomUUID()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: Boolean(input.full_page) });
    const screenshotBytes = await readFile(screenshotPath);
    const screenshotSha256 = crypto.createHash("sha256").update(screenshotBytes).digest("hex");
    let visualDifferenceRatio = null;
    let visualBaselineSha256 = null;
    if (input.baseline_screenshot_path) {
      const baselinePath = path.resolve(text(input.baseline_screenshot_path, 2000));
      if (baselinePath !== proofDir && !baselinePath.startsWith(proofDir + path.sep)) throw new Error("CODE_DEVICE_BROWSER_BASELINE_OUTSIDE_PROOF_DIR");
      let sharp;
      try { ({ default: sharp } = await import("sharp")); }
      catch { throw new Error("CODE_DEVICE_SHARP_REQUIRED_FOR_VISUAL_DIFF"); }
      const baselineBytes = await readFile(baselinePath);
      visualBaselineSha256 = crypto.createHash("sha256").update(baselineBytes).digest("hex");
      const left = await sharp(baselineBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const right = await sharp(screenshotBytes).resize(left.info.width, left.info.height, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const pixels = Math.min(left.data.length, right.data.length) / 4;
      let changed = 0;
      for (let i = 0; i < pixels; i += 1) {
        const o = i * 4;
        const delta = Math.abs(left.data[o] - right.data[o]) + Math.abs(left.data[o + 1] - right.data[o + 1]) + Math.abs(left.data[o + 2] - right.data[o + 2]);
        if (delta > 30) changed += 1;
      }
      visualDifferenceRatio = pixels ? changed / pixels : 1;
    }
    const pageAudit = await page.evaluate(() => {
      const root = document.documentElement;
      const interactive = [...document.querySelectorAll("button,a,input,select,textarea,[role='button']")];
      const missingAccessibleName = interactive.filter((el) => {
        const label = (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.textContent || el.getAttribute("title") || "").trim();
        if (el instanceof HTMLInputElement && ["hidden","submit","button"].includes(el.type)) return false;
        return !label;
      }).slice(0, 40).map((el) => ({ tag: el.tagName.toLowerCase(), id: el.id || null, name: el.getAttribute("name") || null }));
      const imagesWithoutAlt = [...document.querySelectorAll("img")].filter((img) => !img.hasAttribute("alt")).slice(0, 40).map((img) => img.getAttribute("src") || "img");
      const headingLevels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName.slice(1)));
      let headingJump = false; for (let i = 1; i < headingLevels.length; i += 1) if (headingLevels[i] - headingLevels[i - 1] > 1) headingJump = true;
      return {
        width: root.scrollWidth, height: root.scrollHeight, viewport_width: window.innerWidth, viewport_height: window.innerHeight,
        horizontal_overflow: root.scrollWidth > window.innerWidth + 2,
        missing_accessible_name: missingAccessibleName,
        images_without_alt: imagesWithoutAlt,
        heading_jump: headingJump,
      };
    });
    const accessibilityPassed = pageAudit.missing_accessible_name.length === 0 && pageAudit.images_without_alt.length === 0 && pageAudit.heading_jump === false;
    return {
      url: page.url(),
      title,
      http_status: response?.status() || null,
      console_errors: consoleErrors.slice(0, 40),
      page_errors: pageErrors.slice(0, 40),
      failed_requests: failedRequests.slice(0, 40),
      dimensions: { width: pageAudit.width, height: pageAudit.height },
      viewport: { width: pageAudit.viewport_width, height: pageAudit.viewport_height },
      horizontal_overflow: pageAudit.horizontal_overflow,
      accessibility: {
        passed: accessibilityPassed,
        missing_accessible_name: pageAudit.missing_accessible_name,
        images_without_alt: pageAudit.images_without_alt,
        heading_jump: pageAudit.heading_jump,
      },
      replay: { step_count: replayResults.length, passed: replayResults.every((step) => step.passed), steps: replayResults },
      screenshot_path: screenshotPath,
      screenshot_sha256: screenshotSha256,
      visual_baseline_sha256: visualBaselineSha256,
      visual_difference_ratio: visualDifferenceRatio,
      visual_threshold: input.visual_threshold == null ? null : Number(input.visual_threshold),
      visual_passed: visualDifferenceRatio == null ? null : visualDifferenceRatio <= Math.max(0, Math.min(1, Number(input.visual_threshold ?? 0.01))),
      passed: (response?.ok() ?? true) && consoleErrors.length === 0 && pageErrors.length === 0 && pageAudit.horizontal_overflow === false && (input.require_accessibility === true ? accessibilityPassed : true) && (visualDifferenceRatio == null ? true : visualDifferenceRatio <= Math.max(0, Math.min(1, Number(input.visual_threshold ?? 0.01)))) ,
    };
  } finally {
    if (browser) await browser.close().catch(() => null);
    if (server && !server.killed) server.kill("SIGTERM");
  }
}

async function dispatch(config,job){const p=job.payload||{},action=text(job.action,120);if(action==="workspace.open"){const repo=text(p.repository_url,1000).replace(/\.git$/i,"");const source=await findRepository(repo,config.allowed_roots||[]);const ref=text(p.ref||"main",160),exact=/^[0-9a-f]{40}$/i.test(ref);if(exact)await required("git",["cat-file","-e",`${ref}^{commit}`],source,"CODE_DEVICE_COMMIT_MISSING");else await required("git",["fetch","--prune","origin",ref],source,"CODE_DEVICE_FETCH_FAILED");const session_id=crypto.randomUUID(),parent=path.join(os.tmpdir(),"avantiqo-code-device-worktrees"),workspace=path.join(parent,`mission-${session_id}`);await mkdir(parent,{recursive:true});await required("git",["worktree","add","--detach",workspace,exact?ref:(ref==="main"?"origin/main":"FETCH_HEAD")],source,"CODE_DEVICE_WORKTREE_FAILED");if(p.resume_patch){const patch=path.join(workspace,".avantiqo-resume.patch");await writeFile(patch,String(p.resume_patch));await required("git",["apply","--check",patch],workspace,"CODE_DEVICE_RESUME_CHECK_FAILED");await required("git",["apply",patch],workspace,"CODE_DEVICE_RESUME_APPLY_FAILED");await rm(patch,{force:true})}const baseline=await inspect(workspace);await saveSession({session_id,source_root:source,workspace_root:workspace,repository_url:repo,ref,created_at:new Date().toISOString(),revision:0,edit_owner:null,lease_expires_at:null,last_activity_at:new Date().toISOString()});return{session_id,repository_root:workspace,source_repository_root:source,base_commit:baseline.head_sha,exact_commit_ref:exact,remote_fetch_performed:!exact,resume_applied:Boolean(p.resume_patch)}}const s=await loadSession(p.session_id);const root=s.workspace_root;const leaseActive=()=>s.edit_owner&&s.lease_expires_at&&Date.parse(s.lease_expires_at)>Date.now();const saveActivity=async()=>{s.last_activity_at=new Date().toISOString();await saveSession(s)};const assertWritable=(owner)=>{if(leaseActive()&&s.edit_owner!==owner)throw new Error(`CODE_DEVICE_EDIT_LEASE_HELD:${s.edit_owner}`)};if(action==="workspace.attach"){await saveActivity();const current=await inspect(root);return{session_id:s.session_id,repository_root:root,source_repository_root:s.source_root,repository_url:s.repository_url,ref:s.ref,base_commit:current.head_sha,revision:Number(s.revision||0),edit_owner:leaseActive()?s.edit_owner:null,lease_expires_at:leaseActive()?s.lease_expires_at:null,created_at:s.created_at,last_activity_at:s.last_activity_at}}if(action==="workspace.ide_state"){if(!leaseActive()&&s.edit_owner){s.edit_owner=null;s.lease_expires_at=null;await saveSession(s)}return{session_id:s.session_id,revision:Number(s.revision||0),edit_owner:s.edit_owner||null,lease_expires_at:s.lease_expires_at||null,last_activity_at:s.last_activity_at||null}}if(action==="workspace.ide_lease"){const owner=text(p.owner,40).toUpperCase();if(!["HUMAN","CODE"].includes(owner))throw new Error("CODE_DEVICE_EDIT_LEASE_OWNER_INVALID");if(p.release===true){if(s.edit_owner===owner){s.edit_owner=null;s.lease_expires_at=null;await saveActivity()}return{released:true,revision:Number(s.revision||0)}}if(leaseActive()&&s.edit_owner!==owner)throw new Error(`CODE_DEVICE_EDIT_LEASE_HELD:${s.edit_owner}`);s.edit_owner=owner;s.lease_expires_at=new Date(Date.now()+Math.max(15000,Math.min(Number(p.ttl_ms)||120000,10*60*1000))).toISOString();await saveActivity();return{owner,revision:Number(s.revision||0),lease_expires_at:s.lease_expires_at}}if(action==="workspace.file_tree"){const tracked=(await required("git",["ls-files"],root,"CODE_DEVICE_FILE_TREE_FAILED")).stdout.split("\n").map(item=>text(item)).filter(Boolean);const untracked=(await required("git",["ls-files","--others","--exclude-standard"],root,"CODE_DEVICE_FILE_TREE_FAILED")).stdout.split("\n").map(item=>text(item)).filter(Boolean);return{files:[...new Set([...tracked,...untracked])].sort().slice(0,20000),revision:Number(s.revision||0)}}if(action==="workspace.inspect")return inspect(root);if(action==="workspace.search")return searchRepo(root,p.input||{});if(action==="workspace.read")return readRepo(root,p.input||{});if(action==="workspace.apply_files"){assertWritable(text(p.actor,40).toUpperCase()||"CODE");const result=await applyFiles(root,p.files||[]);s.revision=Number(s.revision||0)+1;await saveActivity();return{...result,revision:s.revision}}if(action==="workspace.ide_write"){const owner=text(p.owner,40).toUpperCase()||"HUMAN";assertWritable(owner);const expected=Number(p.expected_revision);if(Number.isFinite(expected)&&expected!==Number(s.revision||0))throw new Error(`CODE_DEVICE_IDE_REVISION_CONFLICT:${s.revision}`);const result=await applyFiles(root,[{path:p.file_path,content:p.content}]);s.revision=Number(s.revision||0)+1;await saveActivity();return{...result,revision:s.revision,file_path:rel(p.file_path)}}if(action==="workspace.run"){const owner=text(p.actor,40).toUpperCase()||"CODE";assertWritable(owner);const cwd=p.cwd&&p.cwd!=="."?path.join(root,rel(p.cwd)):root;if(cwd!==root&&!cwd.startsWith(root+path.sep))throw new Error("CODE_DEVICE_CWD_OUTSIDE_WORKTREE");const before=(await diff(root)).patch;const result=await run(text(p.command,160),Array.isArray(p.args)?p.args:[],cwd,Number(p.timeout_ms)||20*60*1000);const after=(await diff(root)).patch;const mutated=after!==before;if(mutated){s.revision=Number(s.revision||0)+1;await saveActivity()}return{...result,workspace_mutated:mutated,revision:Number(s.revision||0)}}if(action==="workspace.diff")return diff(root);if(action==="browser.verify")return browserVerify(root,p.input||{});if(action==="workspace.stop"){await run("git",["worktree","remove","--force",root],s.source_root,60000).catch(()=>null);await rm(root,{recursive:true,force:true});await rm(sessionFile(p.session_id),{force:true});return{stopped:true}}throw new Error(`CODE_DEVICE_ACTION_UNSUPPORTED:${action}`)}
async function pair(code){const display=process.env.AVANTIQO_CODE_DEVICE_NAME||os.hostname();const paired=await rpc("pair_avantiqo_code_device",{p_pairing_code:code,p_display_name:display,p_platform:`${process.platform}/${process.arch}`,p_capabilities:CAPABILITIES,p_metadata:{agent_contract:CONTRACT,node_version:process.version,hostname:os.hostname()}});const config={contract:CONTRACT,device_id:paired.device_id,device_token:paired.device_token,organization_id:paired.organization_id,display_name:display,allowed_roots:paired.allowed_roots||[],paired_at:new Date().toISOString()};await saveConfig(config);console.log(JSON.stringify({success:true,contract:CONTRACT,device_id:config.device_id,organization_id:config.organization_id,display_name:display,allowed_roots:config.allowed_roots},null,2))}
async function heartbeat(config){await rpc("heartbeat_avantiqo_code_device",{p_device_id:config.device_id,p_device_token:config.device_token,p_capabilities:CAPABILITIES,p_metadata:{agent_contract:CONTRACT,node_version:process.version,hostname:os.hostname(),platform:process.platform,arch:process.arch,allowed_root_count:(config.allowed_roots||[]).length}})}
async function loop(){const config=await loadConfig();console.log(`${CONTRACT}=START device=${config.device_id} name=${config.display_name||os.hostname()}`);while(true){let handled=0;try{await heartbeat(config);const jobs=await rpc("claim_avantiqo_code_device_jobs",{p_device_id:config.device_id,p_device_token:config.device_token,p_limit:4,p_lease_seconds:600});handled=Array.isArray(jobs)?jobs.length:0;for(const job of Array.isArray(jobs)?jobs:[]){const started=Date.now();try{const result=await dispatch(config,job);await rpc("complete_avantiqo_code_device_job",{p_device_id:config.device_id,p_device_token:config.device_token,p_job_id:job.id,p_result:result,p_metrics:{elapsed_ms:Date.now()-started,agent_contract:CONTRACT}})}catch(e){await rpc("fail_avantiqo_code_device_job",{p_device_id:config.device_id,p_device_token:config.device_token,p_job_id:job.id,p_error_code:text(e?.message||e,500),p_retryable:false}).catch(()=>null)}}}catch(e){console.error(`${CONTRACT}_LOOP_ERROR`,text(e?.message||e,700))}await new Promise(r=>setTimeout(r,handled?75:350))}}

await loadPublicLocalEnvFallback();
const [mode,arg]=process.argv.slice(2);if(mode==="pair"){if(!arg)throw new Error("Usage: node scripts/code-device-agent.mjs pair <pairing-code>");await pair(arg)}else if(mode==="run"||!mode){await loop()}else if(mode==="status"){const c=await loadConfig();console.log(JSON.stringify({...c,device_token:"[stored securely]"},null,2))}else{throw new Error("Usage: code-device-agent.mjs [pair <code>|run|status]")}
