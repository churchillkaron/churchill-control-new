export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CREATIVE_TOOL_CAPABILITIES } from "@/lib/creative/tools/registry/CreativeToolRegistry";
import { CreativeToolExecutionRuntime } from "@/lib/creative/tools/runtime/CreativeToolExecutionRuntime";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const TOKEN = "avq-investor-spatial-master-v8-20260821";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const CONTRACT = "AVANTIQO_INVESTOR_FILM_MASTER_V8_OBSIDIAN_MICROCHUNK";
const FPS = 24;
const MASTER_SECONDS = 237.5;
const MICRO_ROOT = `${ORG}/${PROJECT}/spatial-master-v8-micro`;
const FINAL_PATH = `${ORG}/${PROJECT}/spatial-master-v8/avantiqo-investor-film-v8-obsidian-237.5s.mp4`;
const NARRATION = `${ORG}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;
const SCORE = `${ORG}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`;
const LOGO = `${ORG}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;
const FOUNDER = `${ORG}/avantiqo-investor-film-20260820/founder-v7`;

const MEDIA = Object.freeze({
  logo: LOGO,
  founder_origin: `${FOUNDER}/founder-opening-origin-synced-approved-v7.mp4`,
  founder_obvious: `${FOUNDER}/founder-opening-obvious-synced-approved-v7.mp4`,
  founder_built: `${FOUNDER}/founder-opening-built-synced-approved-v7.mp4`,
  founder_integration: `${FOUNDER}/founder-mid-integration-synced-approved-v7.mp4`,
  founder_ai: `${FOUNDER}/founder-mid-ai-synced-approved-v7.mp4`,
  founder_close: `${FOUNDER}/founder-close-synced-approved-v7.mp4`,
  opening_world: `${ORG}/unassigned/7fb49565-ee64-4fc5-b336-64cb334fb758-gemini-tylp0qmz2bpi.mp4`,
  fractured_company: `${ORG}/unassigned/8fce813d-68ac-4032-918e-0eee89871265-gemini-q1zghwo9x4g8.mp4`,
  avantiqo_reveal: `${ORG}/unassigned/5a56a041-3f60-47ff-a67b-bb011db8874c-gemini-qwgea6koo5yg.mp4`,
  field_a: `${ORG}/unassigned/752d3d33-c62c-402c-8459-62b04a9e4010-gemini-urre56o4cv2u.mp4`,
  field_b: `${ORG}/unassigned/68fdaca9-8d0f-46c9-ac86-8a639a593b57-gemini-kh6kptlc7phe.mp4`,
  field_c: `${ORG}/unassigned/0e33d68f-edd6-4b46-9b76-9e73798c9936-gemini-92iup6dlxliw.mp4`,
  field_complete: `${ORG}/unassigned/bf710577-3c52-4d22-b695-f6242c8d0caa-gemini-by1086blb68c.mp4`,
  restaurant: `${ORG}/unassigned/e1b2c387-2dda-4192-bb7a-3cea339e2293-gemini-32vbfjlubvh7.mp4`,
  manager: `${ORG}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`,
  hotel: `${ORG}/unassigned/7c1d5a46-812f-4c68-9e4f-0162c0748360-gemini-hr90v0w9p4wc.mp4`,
  kitchen: `${ORG}/unassigned/cbba2295-76c6-43ea-acf5-1511017cc63b-gemini-v24pbxy5sy1t.mp4`,
  healthcare: `${ORG}/unassigned/9b34b515-b9e4-4772-b142-c4ab375ed5ba-gemini-zzz5upejcnut.mp4`,
  procurement: `${ORG}/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4`,
  finance: `${ORG}/unassigned/701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4`,
  people: `${ORG}/unassigned/97c0dbc3-5cd0-49f8-8121-1f85831ed2ab-gemini-fpkwe0jb7rex.mp4`,
  compliance: `${ORG}/unassigned/a9568908-d7d6-402c-83ff-cf4376c2f9d8-gemini-qztxkgp5yet3.mp4`,
  restaurant_alt: `${ORG}/unassigned/8ad5ac7b-2db9-46a3-8ecf-65e7a7d134a7-gemini-qv0auqgaxcyl.mp4`,
  kitchen_alt: `${ORG}/unassigned/51e67c02-7a80-49c2-bca9-354f5fae7c72-gemini-5f5uydt8ya3j.mp4`,
});

const seconds = (frames) => Number((frames / FPS).toFixed(9));
const storage = (storagePath) => `storage://${BUCKET}/${storagePath}`;
const scene = ({ id, media, frames, domain = "", kicker = "AVANTIQO", caps = [], signal = "", anchor = "left-top", mode = "flow", semantic = "", sourceIn = 0 }) => Object.freeze({
  id,
  source_reference: storage(MEDIA[media]),
  source_kind: "video",
  source_in_seconds: sourceIn,
  duration_seconds: seconds(frames),
  domain,
  kicker,
  capabilities: caps,
  ai_signal: signal,
  anchor,
  overlay_mode: mode,
  accent: "gold",
  source_semantic_role: semantic,
  visual_profile: mode === "none" ? "stable_v7" : "obsidian_v8",
});
const group = (index, scenes) => Object.freeze({ index, scenes:Object.freeze(scenes), frames:scenes.reduce((n,s)=>n+Math.round(s.duration_seconds*FPS),0), duration:seconds(scenes.reduce((n,s)=>n+Math.round(s.duration_seconds*FPS),0)) });

const S = Object.freeze({
  logo: scene({ id:"c1-logo", media:"logo", frames:192, mode:"none", semantic:"APPROVED_3D_AVANTIQO_LOGO" }),
  founderOrigin: scene({ id:"c1-founder-origin", media:"founder_origin", frames:125, mode:"none", semantic:"FOUNDER_OPENING_LIPSYNC_REPAIRED_VISIBLE_WINDOW" }),
  world: scene({ id:"c1-world", media:"opening_world", frames:211, domain:"Real Businesses", kicker:"THE ORIGIN", signal:"Running real companies exposes the same disconnected operating problem.", caps:["Customers","People","Money"], anchor:"right-bottom", mode:"quiet", semantic:"OPENING_WORLD_BUILDING" }),
  fractured: scene({ id:"c1-fractured", media:"fractured_company", frames:192, domain:"Disconnected Systems", kicker:"THE PROBLEM", signal:"Critical context is split across tools, teams and workflows.", caps:["Finance","Operations","Commercial"], anchor:"left-bottom", mode:"flow", semantic:"FRACTURED_COMPANY_PROBLEM" }),
  managerCost: scene({ id:"c1-manager", media:"manager", frames:150, domain:"Fragmented Context", kicker:"THE COST", signal:"People spend time reconnecting information the software should already understand.", caps:["Search","Reconcile","Decide"], anchor:"left-top", mode:"quiet", semantic:"MANAGER_COMMAND_VIEW" }),
  founderObvious: scene({ id:"c1-founder-obvious", media:"founder_obvious", frames:51, mode:"none", semantic:"FOUNDER_OBVIOUS_LIPSYNC" }),
  reveal: scene({ id:"c1-reveal", media:"avantiqo_reveal", frames:172, domain:"One Operating Context", kicker:"AVANTIQO", signal:"Organization, evidence and action begin from one shared business context.", caps:["Context","Evidence","Action"], anchor:"right-bottom", mode:"ai", semantic:"FIRST_AVANTIQO_REVEAL" }),
  founderBuilt: scene({ id:"c1-founder-built", media:"founder_built", frames:61, mode:"none", semantic:"FOUNDER_BUILT_LIPSYNC" }),
  org: scene({ id:"c1-org", media:"manager", frames:182, domain:"Organization Intelligence", kicker:"BUSINESS CONTEXT", signal:"Every action inherits the right organization, entity, period and authority.", caps:["Organization","Entity","Period","Permissions"], anchor:"left-bottom", mode:"ai", semantic:"MANAGER_COMMAND_VIEW" }),
  ops: scene({ id:"c1-ops", media:"kitchen", frames:172, domain:"Operations Command", kicker:"LIVE EXECUTION", signal:"Operational activity becomes visible as accountable work instead of isolated tasks.", caps:["Queue","Assignment","Handoff","Incident"], anchor:"right-top", mode:"flow", semantic:"KITCHEN_EXECUTION" }),
  supply: scene({ id:"c1-supply", media:"procurement", frames:172, domain:"Supply Chain", kicker:"PROCUREMENT → RECEIVING", signal:"Demand, purchasing and receiving stay connected to evidence and finance.", caps:["Purchase Request","Purchase Order","Goods Receipt"], anchor:"left-top", mode:"flow", semantic:"PROCUREMENT_RECEIVING" }),
  finance: scene({ id:"c2-finance", media:"finance", frames:264, domain:"Finance", kicker:"FINANCIAL CORE", signal:"The ledger, cash, invoices and governance share the same operating context.", caps:["General Ledger","Cash Position","Customer Invoice","Controls"], anchor:"right-bottom", mode:"ai", semantic:"FINANCE_LEDGER" }),
  oneContext: scene({ id:"c2-org", media:"avantiqo_reveal", frames:71, domain:"One Business Context", kicker:"AVANTIQO", signal:"The system keeps the business model central as work moves between domains.", anchor:"left-bottom", mode:"quiet", semantic:"FIRST_AVANTIQO_REVEAL" }),
  marketing: scene({ id:"c2-marketing", media:"manager", frames:270, domain:"Commercial Intelligence", kicker:"OBJECTIVE → EXECUTION", signal:"An objective becomes coordinated work, publication and measurable business activity.", caps:["Customer","Campaign","Publish","Revenue"], anchor:"left-bottom", mode:"flow", semantic:"MANAGER_COMMAND_VIEW" }),
  customer: scene({ id:"c2-customer", media:"restaurant", frames:135, domain:"Customer Communications", kicker:"CUSTOMER CONTEXT", signal:"The customer interaction remains connected to service, operations and revenue.", caps:["Customer","Order","Service"], anchor:"right-top", mode:"quiet", semantic:"RESTAURANT_WAITER_ORDER" }),
  opsAction: scene({ id:"c2-ops-action", media:"kitchen_alt", frames:222, domain:"Attention → Action", kicker:"OPERATIONS", signal:"Signals become accountable work with ownership, status and evidence.", caps:["Work Item","Assignment","In Progress","Completed"], anchor:"left-top", mode:"flow", semantic:"KITCHEN_EXECUTION_ALT" }),
  aiTransition: scene({ id:"c2-ai-transition", media:"avantiqo_reveal", frames:102, domain:"Understand → Recommend → Approve → Execute", kicker:"AVANTIQO INTELLIGENCE", signal:"AI is useful when it can reason inside real business context and control.", anchor:"right-bottom", mode:"ai", semantic:"FIRST_AVANTIQO_REVEAL" }),
  field: scene({ id:"c2-field", media:"field_a", frames:182, domain:"Field Service", kicker:"OPERATIONS", signal:"Dispatch, on-site work, evidence and completion form one traceable service flow.", caps:["Assigned","On Site","Evidence","Completed"], anchor:"right-bottom", mode:"flow", semantic:"FIELD_SERVICE_PEST_CONTROL_A" }),
  restaurant: scene({ id:"c2-restaurant", media:"restaurant_alt", frames:116, domain:"Restaurant", kicker:"CROSS-INDUSTRY", signal:"Orders, service and operating activity can run on the same architecture.", anchor:"left-bottom", mode:"quiet", semantic:"RESTAURANT_WAITER_ORDER_ALT" }),
  hotel: scene({ id:"c2-hotel", media:"hotel", frames:117, domain:"Hospitality", kicker:"CROSS-INDUSTRY", signal:"Guest and hotel operations use the same business context without becoming the same workflow.", anchor:"left-bottom", mode:"quiet", semantic:"HOTEL_OPERATIONS" }),
  healthcare: scene({ id:"c2-healthcare", media:"healthcare", frames:116, domain:"Healthcare", kicker:"CROSS-INDUSTRY", signal:"Coordination and accountable work remain industry-specific while the operating foundation stays shared.", anchor:"left-bottom", mode:"quiet", semantic:"HEALTHCARE_COORDINATION" }),
  fieldComplete: scene({ id:"c2-field-complete", media:"field_complete", frames:117, domain:"Connected Service", kicker:"FIELD EXECUTION", signal:"The same context follows the job from assignment through completion evidence.", caps:["Assigned","On Site","Evidence Captured","Verified"], anchor:"right-bottom", mode:"flow", semantic:"FIELD_SERVICE_JOB_COMPLETION" }),
  architecture: scene({ id:"c2-architecture", media:"avantiqo_reveal", frames:70, domain:"One Operating Architecture", kicker:"AVANTIQO", signal:"Different industries. One governed platform foundation.", anchor:"right-bottom", mode:"ai", semantic:"FIRST_AVANTIQO_REVEAL" }),
  founderIntegration: scene({ id:"c3-founder-integration", media:"founder_integration", frames:91, mode:"none", semantic:"FOUNDER_MID_INTEGRATION_LIPSYNC" }),
  commercial: scene({ id:"c3-commercial", media:"restaurant", frames:105, domain:"Commercial", kicker:"CUSTOMER ORDER", signal:"A customer action enters the operating chain.", caps:["Customer","Order"], anchor:"right-top", mode:"quiet", semantic:"RESTAURANT_WAITER_ORDER" }),
  financeFlow: scene({ id:"c3-finance", media:"finance", frames:103, domain:"Finance", kicker:"ORDER → FINANCE", signal:"Revenue and financial evidence update in the same context.", caps:["Revenue","Evidence"], anchor:"left-bottom", mode:"quiet", semantic:"FINANCE_LEDGER" }),
  supplyFlow: scene({ id:"c3-supply", media:"procurement", frames:103, domain:"Supply Chain", kicker:"FINANCE → SUPPLY", signal:"Demand and stock implications remain connected to purchasing and receiving.", caps:["Demand","Purchase Order"], anchor:"right-top", mode:"quiet", semantic:"PROCUREMENT_RECEIVING" }),
  people: scene({ id:"c3-people", media:"people", frames:105, domain:"People", kicker:"SUPPLY → PEOPLE", signal:"Responsibility and authority stay attached to the work.", caps:["Employee","Assignment"], anchor:"right-bottom", mode:"quiet", semantic:"PEOPLE_ROSTER" }),
  interfacesA: scene({ id:"c3-interfaces-a", media:"people", frames:131, domain:"Different Interfaces", kicker:"ONE TRUTH", signal:"Staff and customer-facing work can use different interfaces without creating different realities.", caps:["Staff","Customer"], anchor:"right-bottom", mode:"flow", semantic:"PEOPLE_ROSTER" }),
  interfacesB: scene({ id:"c3-interfaces-b", media:"procurement", frames:132, domain:"Same Operating System", kicker:"ONE TRUTH", signal:"Supplier and operations interfaces still resolve to the same underlying business context.", caps:["Supplier","Operations"], anchor:"left-bottom", mode:"flow", semantic:"PROCUREMENT_RECEIVING" }),
  integrations: scene({ id:"c3-integrations", media:"manager", frames:213, domain:"Connected Channels", kicker:"INTEGRATIONS", signal:"Websites, communications, commerce and external services extend the platform without fragmenting context.", caps:["Website","Communications","Commerce","Services"], anchor:"left-bottom", mode:"ai", semantic:"MANAGER_COMMAND_VIEW" }),
  founderAi: scene({ id:"c3-founder-ai", media:"founder_ai", frames:151, mode:"none", semantic:"FOUNDER_MID_AI_LIPSYNC" }),
  governanceA: scene({ id:"c3-governance-a", media:"manager", frames:152, domain:"Governed AI", kicker:"CONTEXT + AUTHORITY", signal:"AI reasons inside organization context, permissions and workflow state.", caps:["Organization","Permissions","Workflow"], anchor:"left-bottom", mode:"ai", semantic:"MANAGER_COMMAND_VIEW" }),
  governanceB: scene({ id:"c3-governance-b", media:"compliance", frames:152, domain:"Governed AI", kicker:"EVIDENCE + ACCOUNTABILITY", signal:"Actions remain traceable, reviewable and bounded by policy.", caps:["Evidence","Policy","Accountability"], anchor:"right-bottom", mode:"ai", semantic:"COMPLIANCE_INSPECTION" }),
  intelligence: scene({ id:"c3-intelligence", media:"avantiqo_reveal", frames:81, domain:"Avantiqo Intelligence", kicker:"UNDERSTAND THE BUSINESS", signal:"The goal is not another chatbot. It is intelligence grounded in how the business actually operates.", anchor:"right-bottom", mode:"ai", semantic:"FIRST_AVANTIQO_REVEAL" }),
  proofFinance: scene({ id:"c4-proof-finance", media:"finance", frames:63, domain:"Working Proof", kicker:"FINANCE", signal:"Real operating domains share the same platform foundation.", anchor:"right-bottom", mode:"quiet", semantic:"FINANCE_LEDGER" }),
  proofOps: scene({ id:"c4-proof-ops", media:"kitchen", frames:64, domain:"Working Proof", kicker:"OPERATIONS", signal:"Execution stays connected to business context.", anchor:"right-top", mode:"quiet", semantic:"KITCHEN_EXECUTION" }),
  proofField: scene({ id:"c4-proof-field", media:"field_b", frames:63, domain:"Working Proof", kicker:"FIELD SERVICE", signal:"The operating model extends beyond the office.", anchor:"right-bottom", mode:"quiet", semantic:"FIELD_SERVICE_PEST_CONTROL_B" }),
  proofHealth: scene({ id:"c4-proof-health", media:"healthcare", frames:63, domain:"Working Proof", kicker:"HEALTHCARE", signal:"Cross-industry does not mean generic workflows.", anchor:"left-bottom", mode:"quiet", semantic:"HEALTHCARE_COORDINATION" }),
  strategyField: scene({ id:"c4-strategy-field", media:"field_c", frames:75, domain:"Enter Through Pain", kicker:"EXPANSION STRATEGY", signal:"Start with one painful workflow and prove value.", anchor:"right-bottom", mode:"quiet", semantic:"FIELD_SERVICE_PEST_CONTROL_C" }),
  strategyRestaurant: scene({ id:"c4-strategy-restaurant", media:"restaurant", frames:74, domain:"Expand Across Work", kicker:"EXPANSION STRATEGY", signal:"Then connect adjacent operating workflows on the same platform.", anchor:"right-top", mode:"quiet", semantic:"RESTAURANT_WAITER_ORDER" }),
  strategyHotel: scene({ id:"c4-strategy-hotel", media:"hotel", frames:74, domain:"Scale the Foundation", kicker:"EXPANSION STRATEGY", signal:"The horizontal platform compounds as more of the business moves into one context.", anchor:"left-bottom", mode:"quiet", semantic:"HOTEL_OPERATIONS" }),
  founderClose: scene({ id:"c4-founder-close", media:"founder_close", frames:162, mode:"none", semantic:"FOUNDER_CLOSE_LIPSYNC" }),
  logoClose: scene({ id:"c4-logo-close", media:"logo", frames:81, mode:"none", semantic:"APPROVED_3D_AVANTIQO_LOGO_FINAL_HOLD" }),
});

const CHUNKS = Object.freeze([
  group(1,[S.logo,S.founderOrigin]), group(2,[S.world,S.fractured]), group(3,[S.managerCost,S.founderObvious,S.reveal]), group(4,[S.founderBuilt,S.org]), group(5,[S.ops,S.supply]),
  group(6,[S.finance,S.oneContext]), group(7,[S.marketing]), group(8,[S.customer,S.opsAction]), group(9,[S.aiTransition,S.field]), group(10,[S.restaurant,S.hotel,S.healthcare]), group(11,[S.fieldComplete,S.architecture]),
  group(12,[S.founderIntegration,S.commercial,S.financeFlow]), group(13,[S.supplyFlow,S.people,S.interfacesA]), group(14,[S.interfacesB,S.integrations]), group(15,[S.founderAi,S.governanceA]), group(16,[S.governanceB,S.intelligence]),
  group(17,[S.proofFinance,S.proofOps,S.proofField]), group(18,[S.proofHealth,S.strategyField,S.strategyRestaurant]), group(19,[S.strategyHotel,S.founderClose]), group(20,[S.logoClose]),
]);
const TOTAL_FRAMES = CHUNKS.reduce((n,c)=>n+c.frames,0);
if (TOTAL_FRAMES !== 5700) throw new Error(`INVESTOR_V8_MICRO_TIMELINE_INVALID:${TOTAL_FRAMES}`);
const chunkPath = (index) => `${MICRO_ROOT}/chunks/chunk-${String(index).padStart(2,"0")}.mp4`;
const json = (data,status=200) => Response.json(data,{status,headers:{"Cache-Control":"no-store, private"}});

function run(command,args,timeoutMs=420000) {
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{shell:false,stdio:["ignore","ignore","pipe"],env:{...process.env,OMP_NUM_THREADS:"1"}});
    const stderr=[]; let settled=false;
    const timer=setTimeout(()=>{ child.kill("SIGKILL"); if(!settled){settled=true;reject(new Error("INVESTOR_V8_MEDIA_TIMEOUT"));}},timeoutMs);
    child.stderr.on("data",c=>stderr.push(c));
    child.on("error",e=>{clearTimeout(timer);if(!settled){settled=true;reject(e);}});
    child.on("close",code=>{clearTimeout(timer);if(settled)return;settled=true;const trace=Buffer.concat(stderr).toString("utf8");if(code!==0)reject(new Error(trace.slice(-16000)||`FFMPEG_EXIT_${code}`));else resolve(trace);});
  });
}
async function project(){const {data,error}=await supabaseAdmin.from("creative_projects").select("*").eq("id",PROJECT).eq("organization_id",ORG).maybeSingle();if(error)throw error;if(!data)throw new Error("INVESTOR_V8_PROJECT_NOT_FOUND");return data;}
async function signed(storagePath,expires=21600){const {data,error}=await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath,expires);if(error)throw error;if(!data?.signedUrl)throw new Error(`INVESTOR_V8_SIGNED_URL_MISSING:${storagePath}`);return data.signedUrl;}
async function exists(storagePath){const dir=storagePath.slice(0,storagePath.lastIndexOf("/"));const name=storagePath.slice(storagePath.lastIndexOf("/")+1);const {data,error}=await supabaseAdmin.storage.from(BUCKET).list(dir,{search:name,limit:10});if(error)throw error;return (data||[]).some(e=>e.name===name);}
async function probe(ffprobe,input){return new Promise((resolve,reject)=>{const stdout=[],stderr=[];const child=spawn(ffprobe,["-v","error","-show_entries","format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels","-of","json",input],{shell:false,stdio:["ignore","pipe","pipe"]});child.stdout.on("data",c=>stdout.push(c));child.stderr.on("data",c=>stderr.push(c));child.on("error",reject);child.on("close",code=>{if(code!==0)return reject(new Error(Buffer.concat(stderr).toString("utf8")||`FFPROBE_EXIT_${code}`));try{resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")));}catch(e){reject(e);}});});}
async function uploadVideo(buffer,storagePath,metadata={}){const checksum=crypto.createHash("sha256").update(buffer).digest("hex");const {error}=await supabaseAdmin.storage.from(BUCKET).upload(storagePath,buffer,{contentType:"video/mp4",upsert:true,cacheControl:"3600",metadata:{organization_id:ORG,creative_project_id:PROJECT,contract:CONTRACT,checksum,...metadata}});if(error)throw error;return{checksum,bytes:buffer.length};}

async function renderChunk(index){
  const def=CHUNKS.find(c=>c.index===index); if(!def)throw new Error("INVESTOR_V8_CHUNK_INVALID");
  const p=await project();
  for(const item of def.scenes){const storagePath=item.source_reference.replace(`storage://${BUCKET}/`,"");if(!(await exists(storagePath)))throw new Error(`INVESTOR_V8_SOURCE_MISSING:${item.id}`);}
  const execution=await CreativeToolExecutionRuntime.execute({organization_id:ORG,creative_project_id:PROJECT,project:p,capability:CREATIVE_TOOL_CAPABILITIES.SPATIAL_PRODUCT_TWIN,input:{scenes:def.scenes,width:1920,height:1080,fps:FPS}});
  const output=execution?.output;if(!output?.buffer?.length)throw new Error(`INVESTOR_V8_CHUNK_EMPTY:${index}`);
  if(output.authentic_screen_capture_used!==false)throw new Error("INVESTOR_V8_AUTHENTIC_SCREEN_FORBIDDEN");
  if(output.generated_replacement_footage_used!==false)throw new Error("INVESTOR_V8_REPLACEMENT_FOOTAGE_FORBIDDEN");
  const stored=await uploadVideo(output.buffer,chunkPath(index),{microchunk:true,chunk_index:index,duration_seconds:def.duration,total_frames:def.frames,semantic_sync:true,subject_safe_overlays:true,whole_scene_fade_to_black:false,founder_lipsync_targeted:true,opening_visible_lipsync_max_seconds:5.208333333,visual_profile:"obsidian_v8",authentic_screen_capture_used:false,generated_replacement_footage_used:false,visual_language:output.visual_language||"OBSIDIAN_CINEMATIC_INTELLIGENCE_V8"});
  return{success:true,index,path:chunkPath(index),duration_seconds:def.duration,frames:def.frames,scenes:def.scenes.length,checksum:stored.checksum,bytes:stored.bytes,visual_language:output.visual_language||null};
}

async function renderFinal(){
  const ffmpeg=resolveCreativeFfmpegPath(),ffprobe=resolveCreativeFfprobePath();if(!ffmpeg||!ffprobe)throw new Error("INVESTOR_V8_MEDIA_BINARY_NOT_READY");
  const p=await project();for(const def of CHUNKS)if(!(await exists(chunkPath(def.index))))throw new Error(`INVESTOR_V8_CHUNK_NOT_READY:${def.index}`);if(!(await exists(NARRATION))||!(await exists(SCORE)))throw new Error("INVESTOR_V8_AUDIO_SOURCE_MISSING");
  const [chunkUrls,narrationUrl,scoreUrl]=await Promise.all([Promise.all(CHUNKS.map(def=>signed(chunkPath(def.index)))),signed(NARRATION),signed(SCORE)]);
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),"avantiqo-v8-micro-final-"));const list=path.join(directory,"chunks.txt"),visual=path.join(directory,"visual.mp4"),output=path.join(directory,"master.mp4");
  try{
    await fs.writeFile(list,chunkUrls.map(url=>`file '${String(url).replace(/'/g,"'\\''")}'`).join("\n"),"utf8");
    await run(ffmpeg,["-y","-protocol_whitelist","file,http,https,tcp,tls,crypto","-f","concat","-safe","0","-i",list,"-an","-c:v","copy","-fflags","+genpts","-movflags","+faststart",visual],120000);
    await run(ffmpeg,["-y","-i",visual,"-i",narrationUrl,"-stream_loop","-1","-i",scoreUrl,"-filter_complex","[1:a]atrim=0:229.5,asetpts=PTS-STARTPTS,adelay=8000:all=1,aresample=48000,volume=1[voice];[2:a]atrim=0:237.5,asetpts=PTS-STARTPTS,aresample=48000,volume=.22,afade=t=in:st=0:d=2.5,afade=t=out:st=233.5:d=4[score];[voice][score]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=.95[aout]","-map","0:v:0","-map","[aout]","-c:v","copy","-c:a","aac","-b:a","256k","-ar","48000","-ac","2","-t","237.5","-movflags","+faststart",output],180000);
    const media=await probe(ffprobe,output),duration=Number(media?.format?.duration||0),video=(media?.streams||[]).find(s=>s.codec_type==="video"),audio=(media?.streams||[]).find(s=>s.codec_type==="audio");
    if(!video||!audio)throw new Error("INVESTOR_V8_AV_REQUIRED");if(Number(video.width)!==1920||Number(video.height)!==1080)throw new Error("INVESTOR_V8_DIMENSIONS_INVALID");if((video.r_frame_rate||video.avg_frame_rate)!=="24/1")throw new Error(`INVESTOR_V8_FPS_INVALID:${video.r_frame_rate||video.avg_frame_rate}`);if(Math.abs(duration-MASTER_SECONDS)>0.25)throw new Error(`INVESTOR_V8_DURATION_INVALID:${duration}`);
    const bytes=await fs.readFile(output),stored=await uploadVideo(bytes,FINAL_PATH,{final_master:true,microchunk_transport:true,cfr_24fps:true,semantic_sync:true,subject_safe_overlays:true,founder_visible_speaking:true,targeted_lipsync_repair:true,whole_scene_fade_to_black:false,narration_delay_seconds:8,visual_profile:"obsidian_v8",authentic_screen_capture_used:false,generated_replacement_footage_used:false});
    const metadata=p.metadata||{},technical_qc={width:Number(video.width),height:Number(video.height),video_codec:video.codec_name||null,audio_codec:audio.codec_name||null,sample_rate:Number(audio.sample_rate||0)||null,channels:Number(audio.channels||0)||null,duration_seconds:duration,av_streams_present:true};
    const next={contract:CONTRACT,status:"RENDERED_REVIEW_REQUIRED",storage_path:FINAL_PATH,duration_seconds:duration,logo_seconds:8,narration_seconds:229.5,frame_rate:video.r_frame_rate||video.avg_frame_rate,semantic_visual_sync:true,subject_safe_overlays:true,whole_scene_fade_to_black:false,founder_visible_speaking:true,targeted_lipsync_repair:true,opening_visible_lipsync_max_seconds:seconds(125),microchunk_count:CHUNKS.length,visual_profile:"obsidian_v8",authentic_screen_capture_used:false,generated_replacement_footage_used:false,checksum:stored.checksum,bytes:stored.bytes,technical_qc,updated_at:new Date().toISOString()};
    const {error}=await supabaseAdmin.from("creative_projects").update({metadata:{...metadata,spatial_investor_master_v8:next},updated_at:new Date().toISOString()}).eq("id",PROJECT).eq("organization_id",ORG);if(error)throw error;
    return{success:true,rendered:true,status:next.status,output_path:FINAL_PATH,signed_url:await signed(FINAL_PATH,86400),duration_seconds:duration,visual_profile:"obsidian_v8",authentic_screen_capture_used:false,generated_replacement_footage_used:false,semantic_visual_sync:true,technical_qc,checksum:stored.checksum,bytes:stored.bytes};
  }finally{await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});}
}

async function status(){
  const p=await project(),state=p.metadata?.spatial_investor_master_v8||{},chunks=[];for(const def of CHUNKS)chunks.push({index:def.index,ready:await exists(chunkPath(def.index)),path:chunkPath(def.index),duration_seconds:def.duration,frames:def.frames,scenes:def.scenes.length});const ready=await exists(FINAL_PATH);
  return{success:true,contract:CONTRACT,final_ready:ready,state,chunks,timeline:{total_seconds:MASTER_SECONDS,total_frames:TOTAL_FRAMES,microchunk_count:CHUNKS.length,max_microchunk_frames:Math.max(...CHUNKS.map(c=>c.frames)),frame_rate:FPS,semantic_cue_timing:true,equal_length_blocks:false},policies:{visual_profile:"obsidian_v8",authentic_screen_capture_used:false,generated_replacement_footage_used:false,founder_visible_speaking:true,opening_lipsync_max_seconds:seconds(125),whole_scene_fade_to_black:false,subject_safe_overlays:true,hospital_visual:"HEALTHCARE_COORDINATION",hotel_visual:"HOTEL_OPERATIONS",field_service_visual:"FIELD_SERVICE_PEST_CONTROL"},signed_url:ready?await signed(FINAL_PATH,86400):null};
}

export async function GET(request){
  try{const url=new URL(request.url);if(url.searchParams.get("token")!==TOKEN)return json({success:false},404);const action=String(url.searchParams.get("action")||"status").toLowerCase();if(action==="status")return json(await status());if(action==="render-chunk")return json(await renderChunk(Number(url.searchParams.get("index"))));if(action==="render-final")return json(await renderFinal());return json({success:false,error:"Unsupported action"},400);}catch(error){console.error("CREATIVE_INVESTOR_SPATIAL_MASTER_V8_MICRO_FAILED",{message:error?.message||String(error)});return json({success:false,error:error?.message||String(error)},500);}
}
