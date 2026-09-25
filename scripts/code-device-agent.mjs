#!/usr/bin/env node
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { mkdir, open, readFile, writeFile, rename, rm, readdir, stat, statfs } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_DEVICE_AGENT_V1";
const HOME = path.join(os.homedir(), ".avantiqo");
const CONFIG = process.env.AVANTIQO_CODE_DEVICE_CONFIG || path.join(HOME, "code-device.json");
const SESSIONS = path.join(HOME, "code-device-sessions");
const COMPLETED_JOBS = path.join(HOME, "code-device-completed-jobs");
const AGENT_LOCK = path.join(HOME, "code-device-agent.lock");
const COMPLETED_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const COMPLETED_JOB_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const DEVICE_JOB_LEASE_SECONDS = 30 * 60;
const DEVICE_JOB_LEASE_RENEW_INTERVAL_MS = 5 * 60 * 1000;
const DEVICE_RPC_TIMEOUT_MS = 15 * 1000;
const CAPABILITIES = ["code.workspace", "code.terminal", "code.browser.verify"];
const MAX_OUTPUT = 40000;
const MAX_FILE = 512 * 1024;
const MAX_RANGE_MUTATION_FILE = 1024 * 1024;
const MAX_PATCH = 768 * 1024;
const WORKTREE_LOCK_WAIT_MS = 12000;
const WORKTREE_LOCK_STALE_MS = 120000;
const WORKTREE_LOCK_RETRY_MS = 120;
const BLOCKED = new Set(["curl","wget","ssh","scp","rsync","psql","vercel","supabase","bash","sh","zsh","fish","env","xargs"]);
const ALLOWED_ENGINEERING_EXECUTABLES = new Set(["git","node","npm","npx","pnpm","yarn","bun","python","python3","pytest","tsc","tsx","eslint","prettier","jest","vitest","playwright","next","make","cmake","go","cargo","rustc","java","javac","mvn","gradle","dotnet","php","composer","ruby","bundle","swift","clang","gcc","g++"]);

function text(v, n=4000){return String(v??"").trim().slice(0,n)}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function deviceWorktreeLockPath(source){const digest=crypto.createHash("sha256").update(source,"utf8").digest("hex").slice(0,24);return path.join(os.tmpdir(),`avantiqo-code-device-worktree-${digest}.lock`)}
async function acquireDeviceWorktreeLock(source){const lockPath=deviceWorktreeLockPath(source),deadline=Date.now()+WORKTREE_LOCK_WAIT_MS;while(Date.now()<deadline){try{const handle=await open(lockPath,"wx");await handle.writeFile(JSON.stringify({pid:process.pid,source_root:source,acquired_at:new Date().toISOString()}));await handle.close();let released=false;return async()=>{if(released)return;released=true;await rm(lockPath,{force:true}).catch(()=>null)}}catch(error){if(error?.code!=="EEXIST")throw error;const info=await stat(lockPath).catch(()=>null);if(info&&Date.now()-info.mtimeMs>WORKTREE_LOCK_STALE_MS){await rm(lockPath,{force:true}).catch(()=>null);continue}await delay(WORKTREE_LOCK_RETRY_MS)}}throw new Error("CODE_DEVICE_WORKTREE_LOCK_TIMEOUT")}
async function runTrustedWorktreeGit(args,cwd,timeout=60000){const a=(Array.isArray(args)?args:[]).map(String);const add=a.length===5&&a[0]==="worktree"&&a[1]==="add"&&a[2]==="--detach"&&path.isAbsolute(a[3])&&Boolean(a[4]);const remove=a.length===4&&a[0]==="worktree"&&a[1]==="remove"&&a[2]==="--force"&&path.isAbsolute(a[3]);const prune=a.length===4&&a[0]==="worktree"&&a[1]==="prune"&&a[2]==="--expire"&&a[3]==="now";if(!add&&!remove&&!prune)throw new Error("CODE_DEVICE_INTERNAL_WORKTREE_COMMAND_INVALID");return await new Promise((resolve,reject)=>{const child=spawn("git",a,{cwd,env:process.env,stdio:["ignore","pipe","pipe"],shell:false});let out="",err="",done=false;const timer=setTimeout(()=>{if(done)return;child.kill("SIGTERM");setTimeout(()=>{if(!done)child.kill("SIGKILL")},1500).unref()},Math.max(5000,Math.min(timeout,120000)));child.stdout.on("data",c=>out+=c);child.stderr.on("data",c=>err+=c);child.on("error",e=>{if(done)return;done=true;clearTimeout(timer);reject(e)});child.on("close",code=>{if(done)return;done=true;clearTimeout(timer);resolve({command:"git",args:a,cwd,exit_code:Number.isInteger(code)?code:124,stdout:bounded(out),stderr:bounded(err)})})})}
async function createDeviceWorktree(source,workspace,target){const release=await acquireDeviceWorktreeLock(source);try{let created=await runTrustedWorktreeGit(["worktree","add","--detach",workspace,target],source,15000);if(created.exit_code!==0){await rm(workspace,{recursive:true,force:true}).catch(()=>null);await runTrustedWorktreeGit(["worktree","prune","--expire","now"],source,15000).catch(()=>null);created=await runTrustedWorktreeGit(["worktree","add","--detach",workspace,target],source,15000)}if(created.exit_code!==0){const error=new Error(`CODE_DEVICE_WORKTREE_FAILED:git:${created.exit_code}`);error.details=created;throw error}}finally{await release()}}
async function cleanupDeviceWorktree(source,workspace){let release=null;try{release=await acquireDeviceWorktreeLock(source)}catch{await rm(workspace,{recursive:true,force:true}).catch(()=>null);return{metadata_cleanup_deferred:true,repository_lock_acquired:false}}try{await runTrustedWorktreeGit(["worktree","remove","--force",workspace],source,60000).catch(()=>null);return{metadata_cleanup_deferred:false,repository_lock_acquired:true}}finally{await release();await rm(workspace,{recursive:true,force:true}).catch(()=>null)}}
let diskSampleAt=0,diskSample=null;
async function diskTelemetry(config){const now=Date.now();if(diskSample&&now-diskSampleAt<30000)return diskSample;const root=(config?.allowed_roots||[])[0]||process.cwd();try{const fs=await statfs(root);const total=Number(fs.blocks||0)*Number(fs.bsize||0),free=Number(fs.bavail||0)*Number(fs.bsize||0);const freePct=total>0?Math.round((free/total)*1000)/10:null;diskSample={disk_free_bytes:Number.isFinite(free)?Math.max(0,free):null,disk_total_bytes:Number.isFinite(total)?Math.max(0,total):null,disk_free_percent:freePct,disk_pressure:free<4*1024**3?"CRITICAL":free<8*1024**3?"LOW":"OK"};}catch{diskSample={disk_free_bytes:null,disk_total_bytes:null,disk_free_percent:null,disk_pressure:"UNKNOWN"};}diskSampleAt=now;return diskSample}
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
async function rpc(name,body,{timeoutMs=DEVICE_RPC_TIMEOUT_MS}={}){const base=apiBase();if(!base)throw new Error("AVANTIQO_CODE_DEVICE_SUPABASE_URL_REQUIRED");const r=await fetch(`${base}/rest/v1/rpc/${name}`,{method:"POST",headers:headers(),body:JSON.stringify(body),signal:AbortSignal.timeout(Math.max(1000,Math.min(Number(timeoutMs)||DEVICE_RPC_TIMEOUT_MS,60000)))});const raw=await r.text();if(!r.ok)throw new Error(`AVANTIQO_CODE_DEVICE_RPC_FAILED:${name}:${r.status}:${raw.slice(0,500)}`);return raw?JSON.parse(raw):null}
function rpcTransient(error){const message=text(error?.message||error,1200).toLowerCase();return /avantiqo_code_device_rpc_failed:[^:]+:5\d\d:/.test(message)||message.includes("fetch failed")||message.includes("network")||message.includes("timeout")||message.includes("timed out")||message.includes("econnreset")||message.includes("ssl")||message.includes("cloudflare")}
async function acknowledgeCompletedJob(config,job,result,metrics){let lastError=null;for(let attempt=0;attempt<3;attempt+=1){try{return await rpc("complete_avantiqo_code_device_job",{p_device_id:config.device_id,p_device_token:config.device_token,p_job_id:job.id,p_result:result,p_metrics:metrics})}catch(error){lastError=error;if(!rpcTransient(error)||attempt>=2)throw error;await delay([200,600,1400][attempt])}}throw lastError||new Error("CODE_DEVICE_COMPLETION_ACK_FAILED")}
async function renewDeviceJobLease(config,job){return rpc("renew_avantiqo_code_device_job_lease",{p_device_id:config.device_id,p_device_token:config.device_token,p_job_id:job.id,p_lease_seconds:DEVICE_JOB_LEASE_SECONDS})}
function leaseOwnershipLost(error){return text(error?.message||error,1200).includes("AVANTIQO_CODE_DEVICE_JOB_NOT_OWNED_OR_RUNNING")}
function startDeviceJobLeaseRenewal(config,job,onOwnershipLost=null){let stopped=false,ownershipLossReported=false;const renew=()=>{if(stopped)return;renewDeviceJobLease(config,job).catch(error=>{if(leaseOwnershipLost(error)){if(!ownershipLossReported){ownershipLossReported=true;onOwnershipLost?.(error)}return}console.error(`${CONTRACT}_LEASE_RENEW_FAILED`,text(error?.message||error,700))})};const timer=setInterval(renew,DEVICE_JOB_LEASE_RENEW_INTERVAL_MS);timer.unref?.();return()=>{stopped=true;clearInterval(timer)}}
async function acquireAgentSingleton(){
  await mkdir(HOME,{recursive:true});
  for(let attempt=0;attempt<2;attempt+=1){
    try{
      const handle=await open(AGENT_LOCK,"wx");
      await handle.writeFile(JSON.stringify({pid:process.pid,started_at:new Date().toISOString()})+"\n");
      await handle.close();
      let released=false;
      const release=()=>{if(released)return;released=true;rm(AGENT_LOCK,{force:true}).catch(()=>null)};
      process.once("exit",release);
      process.once("SIGINT",()=>{release();process.exit(130)});
      process.once("SIGTERM",()=>{release();process.exit(143)});
      return release;
    }catch(error){
      if(error?.code!=="EEXIST")throw error;
      let stale=true;
      try{
        const existing=JSON.parse(await readFile(AGENT_LOCK,"utf8"));
        const pid=Number(existing?.pid);
        if(Number.isInteger(pid)&&pid>0){try{process.kill(pid,0);stale=false}catch{stale=true}}
      }catch{}
      if(!stale)throw new Error("CODE_DEVICE_AGENT_ALREADY_RUNNING");
      await rm(AGENT_LOCK,{force:true}).catch(()=>null);
    }
  }
  throw new Error("CODE_DEVICE_AGENT_SINGLETON_LOCK_FAILED");
}
async function loadConfig(){return JSON.parse(await readFile(CONFIG,"utf8"))}
async function saveConfig(v){await mkdir(HOME,{recursive:true});await writeFile(CONFIG,JSON.stringify(v,null,2)+"\n",{mode:0o600})}
function rel(value){const s=text(value,2000).replaceAll("\\","/");if(!s||s.startsWith("/")||s.includes("\0"))throw new Error("CODE_DEVICE_PATH_INVALID");const n=path.posix.normalize(s);if(n==="."||n.startsWith("../")||n.includes("/../"))throw new Error("CODE_DEVICE_PATH_INVALID");if(n===".git"||n.startsWith(".git/")||/(^|\/)\.env(?:\.|$)/i.test(n))throw new Error("CODE_DEVICE_PROTECTED_PATH");return n}
function unsafeWorkspaceFilesystemArgument(args=[]){for(const item of (Array.isArray(args)?args:[]).map(String)){const candidates=[item],equalsIndex=item.indexOf("=");if(item.startsWith("-")&&equalsIndex>0)candidates.push(item.slice(equalsIndex+1));for(const rawCandidate of candidates){const candidate=String(rawCandidate||"").trim();if(!candidate)continue;if(/^[a-z]+:\/\//i.test(candidate)){if(/^file:\/\//i.test(candidate))return item;continue}const normalized=candidate.replaceAll("\\","/");if(path.isAbsolute(candidate)||/^[A-Za-z]:\//.test(normalized)||normalized===".."||normalized.startsWith("../")||normalized.includes("/../")||normalized==="~"||normalized.startsWith("~/"))return item}}return null}
function exactIsolatedBuildEnvironment(value){const env=value&&typeof value==="object"&&!Array.isArray(value)?value:{},entries=Object.entries(env);return entries.length===1&&entries[0][0]==="AVANTIQO_NEXT_DIST_DIR"&&entries[0][1]===".next-code-verify"}
function commandGuard(command,args=[],env=null){const raw=text(command,160),c=path.basename(raw).toLowerCase(),a=(Array.isArray(args)?args:[]).map(String);if(env!==undefined&&env!==null&&!(exactIsolatedBuildEnvironment(env)&&raw.toLowerCase()==="npm"&&a.length===2&&a[0]==="run"&&a[1]==="build"))throw new Error("CODE_DEVICE_COMMAND_ENVIRONMENT_NOT_ALLOWED");if(!c||BLOCKED.has(c))throw new Error("CODE_DEVICE_COMMAND_BLOCKED");if(path.isAbsolute(raw)||raw.startsWith("../"))throw new Error("CODE_DEVICE_COMMAND_EXECUTABLE_OUTSIDE_WORKSPACE_BLOCKED");if(unsafeWorkspaceFilesystemArgument(a))throw new Error("CODE_DEVICE_COMMAND_ARGUMENT_OUTSIDE_WORKSPACE_BLOCKED");const repoLocal=raw.startsWith("./");if(!repoLocal&&!ALLOWED_ENGINEERING_EXECUTABLES.has(raw.toLowerCase()))throw new Error("CODE_DEVICE_COMMAND_EXECUTABLE_UNRECOGNIZED");if(c==="git"&&a.some(x=>x.toLowerCase()==="push"))throw new Error("CODE_DEVICE_GIT_PUSH_REQUIRES_GOVERNED_COMMIT");if(c==="git"&&a.some(x=>x.toLowerCase()==="clean"))throw new Error("CODE_DEVICE_GIT_CLEAN_BLOCKED");const joined=`${c} ${a.join(" ")}`.toLowerCase();for(const token of ["deploy --prod","--prod"," publish"," release","db:push","db push","migrate:up","migration:up","remote set-url"]){if(joined.includes(token))throw new Error("CODE_DEVICE_EXTERNAL_SIDE_EFFECT_REQUIRES_GOVERNED_RUNTIME")}}
async function run(command,args=[],cwd,timeout=20*60*1000,env=null,signal=null){commandGuard(command,args,env);if(signal?.aborted)throw new Error("CODE_DEVICE_JOB_LEASE_OWNERSHIP_LOST");return await new Promise((resolve,reject)=>{const child=spawn(command,args.map(String),{cwd,env:env?{...process.env,...env}:process.env,stdio:["ignore","pipe","pipe"],shell:false});let out="",err="",done=false,aborted=false;const finish=()=>{clearTimeout(timer);signal?.removeEventListener?.("abort",onAbort)};const onAbort=()=>{if(done)return;aborted=true;child.kill("SIGTERM");setTimeout(()=>{if(!done)child.kill("SIGKILL")},1500).unref()};signal?.addEventListener?.("abort",onAbort,{once:true});const timer=setTimeout(()=>{if(done)return;child.kill("SIGTERM");setTimeout(()=>{if(!done)child.kill("SIGKILL")},1500).unref()},Math.max(30000,Math.min(timeout,2*60*60*1000)));child.stdout.on("data",c=>out+=c);child.stderr.on("data",c=>err+=c);child.on("error",e=>{if(done)return;done=true;finish();reject(e)});child.on("close",code=>{if(done)return;done=true;finish();if(aborted)return reject(new Error("CODE_DEVICE_JOB_LEASE_OWNERSHIP_LOST"));resolve({command,args,cwd,exit_code:Number.isInteger(code)?code:124,stdout:bounded(out),stderr:bounded(err)})})})}
async function required(command,args,cwd,prefix){const r=await run(command,args,cwd);if(r.exit_code!==0){const e=new Error(`${prefix}:${command}:${r.exit_code}`);e.details=r;throw e}return r}
async function origin(root){return text((await required("git",["remote","get-url","origin"],root,"CODE_DEVICE_GIT_ORIGIN_FAILED")).stdout,2000).replace(/\.git$/i,"")}
async function isDir(p){try{return (await stat(p)).isDirectory()}catch{return false}}
async function findRepository(repositoryUrl,roots){for(const root of roots){const resolved=path.resolve(root);if(await isDir(path.join(resolved,".git"))){if(await origin(resolved).catch(()=>null)===repositoryUrl)return resolved}let entries=[];try{entries=await readdir(resolved,{withFileTypes:true})}catch{continue}for(const e of entries.slice(0,250)){if(!e.isDirectory())continue;const candidate=path.join(resolved,e.name);if(!(await isDir(path.join(candidate,".git"))))continue;if(await origin(candidate).catch(()=>null)===repositoryUrl)return candidate}}throw new Error("CODE_DEVICE_REPOSITORY_NOT_FOUND_IN_ALLOWED_ROOTS")}
function sessionFile(id){return path.join(SESSIONS,`${id}.json`)}
async function saveSession(v){await mkdir(SESSIONS,{recursive:true});await writeFile(sessionFile(v.session_id),JSON.stringify(v,null,2)+"\n",{mode:0o600})}
async function loadSession(id){const s=JSON.parse(await readFile(sessionFile(text(id,240)),"utf8"));if(!s?.workspace_root||!s?.source_root)throw new Error("CODE_DEVICE_SESSION_INVALID");return s}
function completedJobFile(id){const jobId=text(id,80);if(!/^[0-9a-f-]{36}$/i.test(jobId))throw new Error("CODE_DEVICE_JOB_ID_INVALID");return path.join(COMPLETED_JOBS,`${jobId}.json`)}
async function loadCompletedJob(id){try{return JSON.parse(await readFile(completedJobFile(id),"utf8"))}catch(error){if(error?.code==="ENOENT")return null;throw error}}
async function saveCompletedJob(id,result){await mkdir(COMPLETED_JOBS,{recursive:true});const finalPath=completedJobFile(id),tempPath=`${finalPath}.${process.pid}.${crypto.randomUUID()}.tmp`;const payload={job_id:text(id,80),completed_locally_at:new Date().toISOString(),result};await writeFile(tempPath,JSON.stringify(payload)+"\n",{mode:0o600});await rename(tempPath,finalPath);return payload}
async function clearCompletedJob(id){await rm(completedJobFile(id),{force:true}).catch(()=>null)}
let completedJobSweepAt=0;
async function sweepCompletedJobs(){const now=Date.now();if(now-completedJobSweepAt<COMPLETED_JOB_SWEEP_INTERVAL_MS)return;completedJobSweepAt=now;let entries=[];try{entries=await readdir(COMPLETED_JOBS,{withFileTypes:true})}catch(error){if(error?.code==="ENOENT")return;throw error}for(const entry of entries){if(!entry.isFile()||!entry.name.endsWith(".json"))continue;const filePath=path.join(COMPLETED_JOBS,entry.name);const info=await stat(filePath).catch(()=>null);if(info&&now-info.mtimeMs>COMPLETED_JOB_RETENTION_MS)await rm(filePath,{force:true}).catch(()=>null)}}
async function inspect(root){const [head,status,tracked]=await Promise.all([required("git",["rev-parse","HEAD"],root,"CODE_DEVICE_HEAD_FAILED"),required("git",["status","--porcelain=v1"],root,"CODE_DEVICE_STATUS_FAILED"),required("git",["ls-files"],root,"CODE_DEVICE_TRACKED_FAILED")]);const files=tracked.stdout.split("\n").map((item) => text(item)).filter(Boolean);return{head_sha:text(head.stdout,160),clean:!text(status.stdout),tracked_file_count:files.length,tracked_files_sample:files.slice(0,200),local_computer:true,device_agent:true}}
async function diff(root){const exclude=":(exclude).next-code-verify/**",pathspec=["--",".",exclude],untracked=await required("git",["ls-files","--others","--exclude-standard","-z",...pathspec],root,"CODE_DEVICE_UNTRACKED_FAILED");for(const p of untracked.stdout.split("\0").map((item) => text(item)).filter(Boolean)){await required("git",["add","-N","--",rel(p)],root,"CODE_DEVICE_INTENT_ADD_FAILED")}const [status,d,check]=await Promise.all([required("git",["status","--porcelain=v1",...pathspec],root,"CODE_DEVICE_STATUS_FAILED"),required("git",["diff","--binary","--no-ext-diff",...pathspec],root,"CODE_DEVICE_DIFF_FAILED"),run("git",["diff","--check",...pathspec],root)]);if(Buffer.byteLength(d.stdout,"utf8")>MAX_PATCH)throw new Error("CODE_DEVICE_PATCH_TOO_LARGE");return{status:status.stdout.split("\n").map((item) => text(item)).filter(Boolean),patch:d.stdout,patch_bytes:Buffer.byteLength(d.stdout,"utf8"),diff_check:check}}
async function readRepo(root,input={}){const p=rel(input.file_path),b=await readFile(path.join(root,p)),explicit=input.end_line!=null;if(b.length>MAX_FILE&&!explicit)throw new Error("CODE_DEVICE_FILE_TOO_LARGE");if(b.length>MAX_RANGE_MUTATION_FILE)throw new Error("CODE_DEVICE_FILE_TOO_LARGE");const lines=b.toString("utf8").split("\n"),start=Math.max(1,Number(input.start_line)||1),requestedEnd=explicit?Math.max(start,Number(input.end_line)||start):start+399;if(b.length>MAX_FILE&&explicit&&requestedEnd-start+1>200)throw new Error("CODE_AI_LARGE_FILE_READ_WINDOW_TOO_WIDE");const end=Math.min(lines.length,requestedEnd),content=lines.slice(start-1,end).join("\n"),contentBytes=Buffer.byteLength(content,"utf8");if(contentBytes>64*1024)throw new Error("CODE_AI_LARGE_FILE_READ_WINDOW_TOO_LARGE");return{file_path:p,start_line:start,end_line:end,total_lines:lines.length,file_bytes:b.length,content,content_bytes:contentBytes,content_sha256:crypto.createHash("sha256").update(content,"utf8").digest("hex"),large_file_window_read:b.length>MAX_FILE}}
async function applyFiles(root,files=[]){if(!Array.isArray(files)||!files.length||files.length>30)throw new Error("CODE_DEVICE_FILES_INVALID");const written=[];for(const f of files){const p=rel(f.path);const b=Buffer.from(String(f.content??""));if(b.length>MAX_FILE)throw new Error("CODE_DEVICE_FILE_WRITE_TOO_LARGE");const full=path.join(root,p);await mkdir(path.dirname(full),{recursive:true});await writeFile(full,b);written.push({path:p,bytes:b.length})}const check=await run("git",["diff","--check"],root);return{written,diff_check:check,valid:check.exit_code===0}}
async function replaceRange(root,input={}){const p=rel(input.file_path||input.path),start=Number(input.start_line),end=Number(input.end_line),expected=input.expected,replacement=input.replacement;if(!Number.isInteger(start)||start<1)throw new Error("CODE_AI_REPLACE_RANGE_START_LINE_INVALID");if(!Number.isInteger(end)||end<start)throw new Error("CODE_AI_REPLACE_RANGE_END_LINE_INVALID");if(typeof expected!=="string"||typeof replacement!=="string")throw new Error("CODE_AI_REPLACE_RANGE_TEXT_REQUIRED");const full=path.join(root,p),b=await readFile(full);if(b.length>MAX_RANGE_MUTATION_FILE)throw new Error("CODE_AI_REPLACE_RANGE_FILE_TOO_LARGE");const lines=b.toString("utf8").split("\n");if(end>lines.length)throw new Error("CODE_AI_REPLACE_RANGE_OUT_OF_BOUNDS");const observed=lines.slice(start-1,end).join("\n");if(observed!==expected){const error=new Error("CODE_AI_REPLACE_RANGE_STALE_SOURCE");error.details={file_path:p,start_line:start,end_line:end,expected_sha256:crypto.createHash("sha256").update(expected,"utf8").digest("hex"),observed_sha256:crypto.createHash("sha256").update(observed,"utf8").digest("hex"),raw_source_persisted:false};throw error}const replacementLines=replacement===""?[]:replacement.split("\n"),next=[...lines.slice(0,start-1),...replacementLines,...lines.slice(end)].join("\n"),nextBuffer=Buffer.from(next,"utf8");if(nextBuffer.length>MAX_RANGE_MUTATION_FILE)throw new Error("CODE_AI_REPLACE_RANGE_RESULT_TOO_LARGE");await writeFile(full,nextBuffer);const check=await run("git",["diff","--check"],root);return{contract:"AVANTIQO_CODE_WORKSPACE_REPLACE_RANGE_V1",file_path:p,start_line:start,end_line:end,bytes:nextBuffer.length,diff_check:check,valid:check.exit_code===0,expected_sha256:crypto.createHash("sha256").update(expected,"utf8").digest("hex"),replacement_sha256:crypto.createHash("sha256").update(replacement,"utf8").digest("hex"),raw_full_file_persisted:false}}
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

async function dispatch(config,job,signal=null){const p=job.payload||{},action=text(job.action,120);if(action==="workspace.open"){const repo=text(p.repository_url,1000).replace(/\.git$/i,"");const source=await findRepository(repo,config.allowed_roots||[]);const ref=text(p.ref||"main",160),exact=/^[0-9a-f]{40}$/i.test(ref);if(exact)await required("git",["cat-file","-e",`${ref}^{commit}`],source,"CODE_DEVICE_COMMIT_MISSING");else await required("git",["fetch","--prune","origin",ref],source,"CODE_DEVICE_FETCH_FAILED");const session_id=crypto.randomUUID(),parent=path.join(os.tmpdir(),"avantiqo-code-device-worktrees"),workspace=path.join(parent,`mission-${session_id}`);await mkdir(parent,{recursive:true});await createDeviceWorktree(source,workspace,exact?ref:(ref==="main"?"origin/main":"FETCH_HEAD"));if(p.resume_patch){const patch=path.join(workspace,".avantiqo-resume.patch");await writeFile(patch,String(p.resume_patch));await required("git",["apply","--check",patch],workspace,"CODE_DEVICE_RESUME_CHECK_FAILED");await required("git",["apply",patch],workspace,"CODE_DEVICE_RESUME_APPLY_FAILED");await rm(patch,{force:true})}const baseline=await inspect(workspace);await saveSession({session_id,source_root:source,workspace_root:workspace,repository_url:repo,ref,created_at:new Date().toISOString(),revision:0,edit_owner:null,lease_expires_at:null,last_activity_at:new Date().toISOString()});return{session_id,repository_root:workspace,source_repository_root:source,base_commit:baseline.head_sha,exact_commit_ref:exact,remote_fetch_performed:!exact,resume_applied:Boolean(p.resume_patch)}}const s=await loadSession(p.session_id);const root=s.workspace_root;const leaseActive=()=>s.edit_owner&&s.lease_expires_at&&Date.parse(s.lease_expires_at)>Date.now();const saveActivity=async()=>{s.last_activity_at=new Date().toISOString();await saveSession(s)};const assertWritable=(owner)=>{if(leaseActive()&&s.edit_owner!==owner)throw new Error(`CODE_DEVICE_EDIT_LEASE_HELD:${s.edit_owner}`)};if(action==="workspace.attach"){await saveActivity();const current=await inspect(root);return{session_id:s.session_id,repository_root:root,source_repository_root:s.source_root,repository_url:s.repository_url,ref:s.ref,base_commit:current.head_sha,revision:Number(s.revision||0),edit_owner:leaseActive()?s.edit_owner:null,lease_expires_at:leaseActive()?s.lease_expires_at:null,created_at:s.created_at,last_activity_at:s.last_activity_at}}if(action==="workspace.ide_state"){if(!leaseActive()&&s.edit_owner){s.edit_owner=null;s.lease_expires_at=null;await saveSession(s)}return{session_id:s.session_id,revision:Number(s.revision||0),edit_owner:s.edit_owner||null,lease_expires_at:s.lease_expires_at||null,last_activity_at:s.last_activity_at||null,...await diskTelemetry(config)}}if(action==="workspace.ide_lease"){const owner=text(p.owner,40).toUpperCase();if(!["HUMAN","CODE"].includes(owner))throw new Error("CODE_DEVICE_EDIT_LEASE_OWNER_INVALID");if(p.release===true){if(s.edit_owner===owner){s.edit_owner=null;s.lease_expires_at=null;await saveActivity()}return{released:true,revision:Number(s.revision||0)}}if(leaseActive()&&s.edit_owner!==owner)throw new Error(`CODE_DEVICE_EDIT_LEASE_HELD:${s.edit_owner}`);s.edit_owner=owner;s.lease_expires_at=new Date(Date.now()+Math.max(15000,Math.min(Number(p.ttl_ms)||120000,10*60*1000))).toISOString();await saveActivity();return{owner,revision:Number(s.revision||0),lease_expires_at:s.lease_expires_at}}if(action==="workspace.file_tree"){const tracked=(await required("git",["ls-files"],root,"CODE_DEVICE_FILE_TREE_FAILED")).stdout.split("\n").map(item=>text(item)).filter(Boolean);const untracked=(await required("git",["ls-files","--others","--exclude-standard"],root,"CODE_DEVICE_FILE_TREE_FAILED")).stdout.split("\n").map(item=>text(item)).filter(Boolean);return{files:[...new Set([...tracked,...untracked])].sort().slice(0,20000),revision:Number(s.revision||0)}}if(action==="workspace.inspect")return inspect(root);if(action==="workspace.search")return searchRepo(root,p.input||{});if(action==="workspace.read")return readRepo(root,p.input||{});if(action==="workspace.apply_files"){assertWritable(text(p.actor,40).toUpperCase()||"CODE");const result=await applyFiles(root,p.files||[]);s.revision=Number(s.revision||0)+1;await saveActivity();return{...result,revision:s.revision}}if(action==="workspace.replace_range"){assertWritable(text(p.actor,40).toUpperCase()||"CODE");const result=await replaceRange(root,p.input||{});s.revision=Number(s.revision||0)+1;await saveActivity();return{...result,revision:s.revision}}if(action==="workspace.ide_write"){const owner=text(p.owner,40).toUpperCase()||"HUMAN";assertWritable(owner);const expected=Number(p.expected_revision);if(Number.isFinite(expected)&&expected!==Number(s.revision||0))throw new Error(`CODE_DEVICE_IDE_REVISION_CONFLICT:${s.revision}`);const result=await applyFiles(root,[{path:p.file_path,content:p.content}]);s.revision=Number(s.revision||0)+1;await saveActivity();return{...result,revision:s.revision,file_path:rel(p.file_path)}}if(action==="workspace.run"){const owner=text(p.actor,40).toUpperCase()||"CODE";assertWritable(owner);const cwd=p.cwd&&p.cwd!=="."?path.join(root,rel(p.cwd)):root;if(cwd!==root&&!cwd.startsWith(root+path.sep))throw new Error("CODE_DEVICE_CWD_OUTSIDE_WORKTREE");const before=(await diff(root)).patch;const result=await run(text(p.command,160),Array.isArray(p.args)?p.args:[],cwd,Number(p.timeout_ms)||20*60*1000,p.env||null,signal);const after=(await diff(root)).patch;const mutated=after!==before;if(mutated){s.revision=Number(s.revision||0)+1;await saveActivity()}return{...result,workspace_mutated:mutated,revision:Number(s.revision||0)}}if(action==="workspace.diff")return diff(root);if(action==="browser.verify")return browserVerify(root,p.input||{});if(action==="workspace.stop"){const cleanup=await cleanupDeviceWorktree(s.source_root,root);await rm(sessionFile(p.session_id),{force:true});return{stopped:true,...cleanup}}throw new Error(`CODE_DEVICE_ACTION_UNSUPPORTED:${action}`)}
async function pair(code){const display=process.env.AVANTIQO_CODE_DEVICE_NAME||os.hostname();const paired=await rpc("pair_avantiqo_code_device",{p_pairing_code:code,p_display_name:display,p_platform:`${process.platform}/${process.arch}`,p_capabilities:CAPABILITIES,p_metadata:{agent_contract:CONTRACT,node_version:process.version,hostname:os.hostname()}});const config={contract:CONTRACT,device_id:paired.device_id,device_token:paired.device_token,organization_id:paired.organization_id,display_name:display,allowed_roots:paired.allowed_roots||[],paired_at:new Date().toISOString()};await saveConfig(config);console.log(JSON.stringify({success:true,contract:CONTRACT,device_id:config.device_id,organization_id:config.organization_id,display_name:display,allowed_roots:config.allowed_roots},null,2))}
const DEVICE_HEARTBEAT_INTERVAL_MS=Math.max(15000,Number(process.env.AVANTIQO_CODE_DEVICE_HEARTBEAT_MS)||30000);
const DEVICE_IDLE_POLL_INTERVAL_MS=Math.max(1000,Number(process.env.AVANTIQO_CODE_DEVICE_IDLE_POLL_MS)||1000);
const DEVICE_ACTIVE_POLL_INTERVAL_MS=Math.max(75,Number(process.env.AVANTIQO_CODE_DEVICE_ACTIVE_POLL_MS)||150);
const DEVICE_INTERACTIVE_BURST_MS=Math.max(5000,Number(process.env.AVANTIQO_CODE_DEVICE_INTERACTIVE_BURST_MS)||30000);
async function heartbeat(config){const disk=await diskTelemetry(config);await rpc("heartbeat_avantiqo_code_device",{p_device_id:config.device_id,p_device_token:config.device_token,p_capabilities:CAPABILITIES,p_metadata:{agent_contract:CONTRACT,node_version:process.version,hostname:os.hostname(),platform:process.platform,arch:process.arch,allowed_root_count:(config.allowed_roots||[]).length,...disk}})}
async function loop(){const config=await loadConfig();let lastHeartbeatAt=0,interactiveUntil=0;console.log(`${CONTRACT}=START device=${config.device_id} name=${config.display_name||os.hostname()} heartbeat_ms=${DEVICE_HEARTBEAT_INTERVAL_MS} idle_poll_ms=${DEVICE_IDLE_POLL_INTERVAL_MS} active_poll_ms=${DEVICE_ACTIVE_POLL_INTERVAL_MS} interactive_burst_ms=${DEVICE_INTERACTIVE_BURST_MS}`);while(true){let handled=0;try{await sweepCompletedJobs();const now=Date.now();if(now-lastHeartbeatAt>=DEVICE_HEARTBEAT_INTERVAL_MS){await heartbeat(config);lastHeartbeatAt=Date.now()}const jobs=await rpc("claim_avantiqo_code_device_jobs",{p_device_id:config.device_id,p_device_token:config.device_token,p_limit:1,p_lease_seconds:DEVICE_JOB_LEASE_SECONDS});handled=Array.isArray(jobs)?jobs.length:0;if(handled>0)interactiveUntil=Date.now()+DEVICE_INTERACTIVE_BURST_MS;for(const job of Array.isArray(jobs)?jobs:[]){const started=Date.now();let result=null;let executionFailed=null;let replayedFromLocalCache=false;try{const cached=await loadCompletedJob(job.id);if(cached?.job_id===job.id&&cached?.result!==undefined){result=cached.result;replayedFromLocalCache=true}else{const executionController=new AbortController();const stopLeaseRenewal=startDeviceJobLeaseRenewal(config,job,()=>executionController.abort());try{result=await dispatch(config,job,executionController.signal)}finally{stopLeaseRenewal()}await saveCompletedJob(job.id,result)}}catch(e){executionFailed=e}if(executionFailed){await rpc("fail_avantiqo_code_device_job",{p_device_id:config.device_id,p_device_token:config.device_token,p_job_id:job.id,p_error_code:text(executionFailed?.message||executionFailed,500),p_retryable:false}).catch(()=>null);continue}try{await acknowledgeCompletedJob(config,job,result,{elapsed_ms:Date.now()-started,agent_contract:CONTRACT,replayed_from_local_completion_cache:replayedFromLocalCache});await clearCompletedJob(job.id)}catch(e){console.error(`${CONTRACT}_COMPLETION_ACK_PENDING`,text(e?.message||e,700))}}}catch(e){console.error(`${CONTRACT}_LOOP_ERROR`,text(e?.message||e,700))}const interactive=handled>0||Date.now()<interactiveUntil;await new Promise(r=>setTimeout(r,interactive?DEVICE_ACTIVE_POLL_INTERVAL_MS:DEVICE_IDLE_POLL_INTERVAL_MS))}}

await loadPublicLocalEnvFallback();
const [mode,arg]=process.argv.slice(2);if(mode==="pair"){if(!arg)throw new Error("Usage: node scripts/code-device-agent.mjs pair <pairing-code>");await pair(arg)}else if(mode==="run"||!mode){await acquireAgentSingleton();await loop()}else if(mode==="status"){const c=await loadConfig();console.log(JSON.stringify({...c,device_token:"[stored securely]"},null,2))}else{throw new Error("Usage: code-device-agent.mjs [pair <code>|run|status]")}
