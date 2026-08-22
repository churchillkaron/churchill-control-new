import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { investorBrandMark } from "@/lib/investor-film/InvestorBrandMarkRuntime";

const CONTRACT = "AVANTIQO_INVESTOR_V9_DYNAMIC_LUXURY_V4";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const BUCKET = "creative-assets";
const FPS = 24;
const THREADS = ["-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1"];
const FOUNDER = `${ORG}/avantiqo-investor-film-20260820/founder-v7`;

const SOURCES = Object.freeze({
  founderOpening: `${FOUNDER}/founder-opening-built-synced-approved-v7.mp4`,
  founderMid: `${FOUNDER}/founder-mid-integration-synced-approved-v7.mp4`,
  manager: `${ORG}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`,
  communications: `${ORG}/unassigned/51e67c02-7a80-49c2-bca9-354f5fae7c72-gemini-5f5uydt8ya3j.mp4`,
  reveal: `${ORG}/unassigned/5a56a041-3f60-47ff-a67b-bb011db8874c-gemini-qwgea6koo5yg.mp4`,
  restaurant: `${ORG}/unassigned/e1b2c387-2dda-4192-bb7a-3cea339e2293-gemini-32vbfjlubvh7.mp4`,
  restaurantAlt: `${ORG}/unassigned/8ad5ac7b-2db9-46a3-8ecf-65e7a7d134a7-gemini-qv0auqgaxcyl.mp4`,
  kitchen: `${ORG}/unassigned/cbba2295-76c6-43ea-acf5-1511017cc63b-gemini-v24pbxy5sy1t.mp4`,
  procurement: `${ORG}/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4`,
  finance: `${ORG}/unassigned/701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4`,
  people: `${ORG}/unassigned/97c0dbc3-5cd0-49f8-8121-1f85831ed2ab-gemini-fpkwe0jb7rex.mp4`,
  hotel: `${ORG}/unassigned/7c1d5a46-812f-4c68-9e4f-0162c0748360-gemini-hr90v0w9p4wc.mp4`,
  field: `${ORG}/unassigned/752d3d33-c62c-402c-8459-62b04a9e4010-gemini-urre56o4cv2u.mp4`,
  healthcare: `${ORG}/unassigned/9b34b515-b9e4-4772-b142-c4ab375ed5ba-gemini-zzz5upejcnut.mp4`,
  studioVideo: `${ORG}/1460b8b2-ef56-4548-8c58-ded3c0d1bed7/e5e0935c-10b7-4206-9141-dd96c4e742d0/e5e0935c-10b7-4206-9141-dd96c4e742d0.mp4`,
  studioPoster: `${ORG}/campaigns/9f9cdf6f-5a6d-4d3a-8df0-b091ea266ecc/f9a260d4-b83b-4022-8844-9a1aace6c06c-03-churchill.png`,
});

const CHAPTERS = Object.freeze({
  business_partner: {
    frames: 922,
    output: `${ORG}/avantiqo-investor-film-20260822/business-partner-dynamic-luxury-v4-922f.mp4`,
    scenes: [
      { id: "founder", source: "founderOpening", frames: 61, mode: "clean" },
      { id: "conversation", source: "manager", frames: 130, mode: "conversation" },
      { id: "context", source: "reveal", frames: 160, mode: "context" },
      { id: "growth", source: "restaurant", frames: 145, mode: "growth" },
      { id: "control", source: "finance", frames: 145, mode: "control" },
      { id: "recommend", source: "manager", frames: 121, mode: "recommend" },
      { id: "execute", source: "procurement", frames: 160, mode: "execute" },
    ],
  },
  communication: {
    frames: 911,
    output: `${ORG}/avantiqo-investor-film-20260822/communication-dynamic-luxury-v4-911f.mp4`,
    scenes: [
      { id: "intent", source: "manager", frames: 120, mode: "intent" },
      { id: "channels", source: "communications", frames: 168, mode: "channels" },
      { id: "context", source: "reveal", frames: 156, mode: "communicationContext" },
      { id: "ai", source: "manager", frames: 144, mode: "ai" },
      { id: "action", source: "restaurant", frames: 203, mode: "communicationAction" },
      { id: "learning", source: "finance", frames: 120, mode: "learning" },
    ],
  },
  cross_domain: {
    frames: 1174,
    output: `${ORG}/avantiqo-investor-film-20260822/cross-domain-dynamic-luxury-v4-1174f.mp4`,
    scenes: [
      { id: "founder", source: "founderMid", frames: 91, mode: "clean" },
      { id: "event", source: "restaurant", frames: 164, mode: "event" },
      { id: "commercial", source: "restaurant", frames: 122, mode: "domainGlass", domain: "COMMERCIAL", detail: "CUSTOMER · ORDER · DEMAND" },
      { id: "operations", source: "kitchen", frames: 122, mode: "domainClean", domain: "OPERATIONS", detail: "WORK · QUEUE · HANDOFF" },
      { id: "supply", source: "procurement", frames: 122, mode: "domainGlass", domain: "SUPPLY CHAIN", detail: "STOCK · PURCHASE · RECEIVING" },
      { id: "people", source: "people", frames: 110, mode: "domainClean", domain: "PEOPLE", detail: "RESPONSIBILITY · SCHEDULE · AUTHORITY" },
      { id: "finance", source: "finance", frames: 122, mode: "domainGlass", domain: "FINANCE", detail: "REVENUE · CASH · LEDGER" },
      { id: "industry", source: "hotel", frames: 144, mode: "industry" },
      { id: "governance", source: "reveal", frames: 177, mode: "governance" },
    ],
  },
  studio: {
    frames: 881,
    output: `${ORG}/avantiqo-investor-film-20260822/studio-marketing-dynamic-luxury-v4-881f.mp4`,
    scenes: [
      { id: "objective", source: "manager", frames: 118, mode: "objective" },
      { id: "territories", source: "reveal", frames: 174, mode: "territoryGlass" },
      { id: "production", source: "studioVideo", frames: 156, mode: "productionFullBleed" },
      { id: "marketing", source: "manager", frames: 176, mode: "marketing" },
      { id: "launch", source: "studioVideo", frames: 132, mode: "launchFullBleed" },
      { id: "learn", source: "finance", frames: 125, mode: "studioLearning" },
    ],
  },
});

for (const [id, chapter] of Object.entries(CHAPTERS)) {
  const sum = chapter.scenes.reduce((total, scene) => total + scene.frames, 0);
  if (sum !== chapter.frames) throw new Error(`DYNAMIC_LUXURY_TIMELINE_INVALID:${id}:${sum}/${chapter.frames}`);
}

function run(command, args, timeoutMs = 680000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1" },
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) { settled = true; reject(new Error("DYNAMIC_LUXURY_MEDIA_TIMEOUT")); }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); if (!settled) { settled = true; reject(error); } });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) reject(new Error(err.slice(-18000) || `MEDIA_EXIT_${code}`));
      else resolve(out);
    });
  });
}

async function exists(storagePath) {
  const directory = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const name = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(directory, { search: name, limit: 10 });
  if (error) throw error;
  return (data || []).some((entry) => entry.name === name);
}

async function signed(storagePath, seconds = 21600) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`DYNAMIC_LUXURY_SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function upload(storagePath, localPath, metadata) {
  const bytes = await fs.readFile(localPath);
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      ...metadata,
      contract: CONTRACT,
      cards_repeated: false,
      screenshots_used: false,
      generated_product_ui: false,
      dynamic_visual_grammar: true,
      authentic_assets_as_source_truth: true,
    },
  });
  if (error) throw error;
  return { path: storagePath, bytes: bytes.length, checksum };
}

async function probe(ffprobe, input) {
  const raw = await run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames", "-of", "json", input], 120000);
  return JSON.parse(raw || "{}");
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function defs() {
  return `<defs>
    <linearGradient id="platinum" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".25" stop-color="#dfe3e7" stop-opacity=".35"/><stop offset=".52" stop-color="#fff" stop-opacity=".82"/><stop offset=".8" stop-color="#8f98a1" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".10"/><stop offset=".42" stop-color="#b7bec6" stop-opacity=".028"/><stop offset="1" stop-color="#020305" stop-opacity=".18"/></linearGradient>
    <linearGradient id="glassEdge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".42" stop-color="#fff" stop-opacity=".56"/><stop offset=".8" stop-color="#d6a66a" stop-opacity=".30"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient>
    <radialGradient id="halo"><stop offset="0" stop-color="#f2f4f6" stop-opacity=".14"/><stop offset=".55" stop-color="#bbc2c9" stop-opacity=".045"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <radialGradient id="warm"><stop offset="0" stop-color="#d6a66a" stop-opacity=".15"/><stop offset="1" stop-color="#d6a66a" stop-opacity="0"/></radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="16"/></filter>
  </defs>`;
}

function titleBlock(eyebrow, title, subtitle = "", x = 108, y = 104) {
  return `<text x="${x}" y="${y}" fill="#cdd2d7" fill-opacity=".70" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="500" letter-spacing="4">${esc(eyebrow)}</text>
    <text x="${x}" y="${y + 62}" fill="#f5f6f7" font-family="Arial,Helvetica,sans-serif" font-size="42" font-weight="500">${esc(title)}</text>
    ${subtitle ? `<text x="${x + 2}" y="${y + 103}" fill="#a6adb4" font-family="Arial,Helvetica,sans-serif" font-size="16">${esc(subtitle)}</text>` : ""}
    <rect x="${x}" y="${y + 132}" width="520" height="1" fill="url(#platinum)"/>`;
}

function micro(x, y, text, opacity = 0.60, anchor = "start") {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="#d8dde1" fill-opacity="${opacity}" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="500" letter-spacing="2.3">${esc(text)}</text>`;
}

function point(x, y, r = 4, warm = false) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${warm ? "#d6a66a" : "#eef1f4"}" fill-opacity="${warm ? ".86" : ".72"}"/><circle cx="${x}" cy="${y}" r="${r * 5}" fill="none" stroke="${warm ? "#d6a66a" : "#eef1f4"}" stroke-opacity=".07"/>`;
}

function line(d, opacity = 0.16, warm = false) {
  return `<path d="${d}" fill="none" stroke="${warm ? "#d6a66a" : "#e5e9ed"}" stroke-opacity="${opacity}" stroke-width="1.2"/>`;
}

function glassPlane(x, y, w, h, title, detail = "", skew = 0, strength = 1) {
  const dx = skew;
  return `<g><polygon points="${x + dx},${y} ${x + w},${y + 22} ${x + w - dx},${y + h} ${x},${y + h - 18}" fill="url(#glass)" fill-opacity="${0.55 * strength}" stroke="url(#glassEdge)" stroke-opacity="${0.60 * strength}" stroke-width="1"/><path d="M${x + dx + 22} ${y + 18} L${x + w - 90} ${y + 34}" stroke="#fff" stroke-opacity="${0.18 * strength}"/><text x="${x + 34}" y="${y + 66}" fill="#f0f2f4" fill-opacity="${0.90 * strength}" font-family="Arial" font-size="18" font-weight="500" letter-spacing="1.4">${esc(title)}</text>${detail ? `<text x="${x + 34}" y="${y + 96}" fill="#a6adb4" fill-opacity="${0.74 * strength}" font-family="Arial" font-size="11" letter-spacing="1.2">${esc(detail)}</text>` : ""}</g>`;
}

function businessOverlay(scene) {
  if (scene.mode === "conversation") return `${titleBlock("BUSINESS PARTNER", "Talk to the company like a person.", "A business objective becomes an executive conversation, not a workflow form.")}
    <text x="155" y="440" fill="#f6f6f5" font-family="Arial" font-size="31">Grow revenue tonight — but don’t reduce margin.</text>${micro(157, 476, "OWNER · VOICE", .46)}
    ${glassPlane(980, 360, 700, 230, "I’ll compare growth against capacity,", "margin and supply before anything changes.", 34, .90)}
    ${point(930, 475, 5, true)}${line("M560 455 C700 455 790 475 915 475", .16)}`;
  if (scene.mode === "context") {
    const nodes = [[420,390,"FINANCE"],[610,305,"OPERATIONS"],[840,270,"SUPPLY CHAIN"],[1135,300,"PEOPLE"],[1390,405,"CUSTOMERS"],[1170,650,"COMMERCIAL"],[830,700,"CONSTRAINTS"],[535,615,"CURRENT STATE"]];
    return `${titleBlock("LIVE BUSINESS CONTEXT", "The operating truth assembles before the answer.", "Some information sits in glass. Some remains spatial. All of it belongs to one reasoning surface.")}
      <ellipse cx="900" cy="520" rx="430" ry="250" fill="url(#halo)"/>
      ${nodes.map(([x,y,t],i)=>`${line(`M900 520 C${(900+x)/2} ${500+(i%2?50:-35)}, ${(900+x)/2} ${y}, ${x} ${y}`, .10)}${point(x,y,i===6?5:3.5,i===6)}${micro(x+18,y+4,t,i===6?.82:.58)}`).join("")}
      ${glassPlane(710, 430, 390, 165, "AVANTIQO", "LIVE OPERATING CONTEXT", 24, .72)}`;
  }
  if (scene.mode === "growth" || scene.mode === "control") {
    const controlled = scene.mode === "control";
    return `${titleBlock(controlled ? "DIGITAL TWIN · PATH B" : "DIGITAL TWIN · PATH A", controlled ? "Grow selectively. Protect the constraint." : "Push demand harder.", controlled ? "The safer path moves demand where the business can absorb it." : "The aggressive path exposes pressure before execution.")}
      ${glassPlane(250, 350, 600, 330, controlled ? "CONTROLLED GROWTH" : "MAXIMUM DEMAND", controlled ? "MARGIN · CAPACITY · SUPPLY ALIGNED" : "VOLUME · PRESSURE · TRADE-OFF", -28, controlled ? .95 : .64)}
      ${glassPlane(1040, 405, 520, 250, controlled ? "BUSINESS CAN ABSORB" : "CONSTRAINTS RISE", controlled ? "PEAK LOAD PROTECTED" : "CAPACITY · TEAM · SUPPLY", 26, controlled ? .72 : .52)}
      ${point(925,520,5,controlled)}${line("M850 520 H1030", .20, controlled)}`;
  }
  if (scene.mode === "recommend") return `${titleBlock("RECOMMENDATION", "Protect the constraint. Push where the business can absorb it.", "The trade-off is explained before authority is requested.")}
    <text x="160" y="450" fill="#f4f5f6" font-family="Arial" font-size="54">CONTROLLED GROWTH</text><rect x="160" y="490" width="790" height="1" fill="url(#platinum)"/>
    ${micro(165,548,"MARGIN PROTECTED",.70)}${micro(500,548,"CAPACITY IS THE CONSTRAINT",.70)}${glassPlane(1190,390,430,180,"APPROVAL REQUIRED","OWNER AUTHORITY",18,.82)}${point(1140,485,5,true)}`;
  if (scene.mode === "execute") {
    const xs = [280,570,860,1150,1440], labels = ["COMMERCIAL","OPERATIONS","SUPPLY","PEOPLE","FINANCE"];
    return `${titleBlock("GOVERNED EXECUTION", "“Do it.” becomes coordinated work across the company.", "One decision. Connected consequences. Evidence attached.")}
      ${xs.map((x,i)=>`${point(x,520,5,i===4)}${i<xs.length-1?line(`M${x+12} 520 H${xs[i+1]-12}`,.22):""}${micro(x,570,labels[i],.72,"middle")}`).join("")}
      <text x="860" y="720" text-anchor="middle" fill="#f0f2f3" font-family="Arial" font-size="20" letter-spacing="3">UNDERSTAND  →  RECOMMEND  →  APPROVE  →  EXECUTE</text>`;
  return "";
}

function communicationOverlay(scene) {
  if (scene.mode === "intent") return `${titleBlock("BUSINESS INTENT", "Tell Avantiqo the outcome. Not the steps.", "Increase revenue tonight — without reducing margin.")}
    <text x="150" y="525" fill="#f4f5f6" font-family="Arial" font-size="70" font-weight="400">OUTCOME</text><rect x="150" y="565" width="470" height="1" fill="url(#platinum)"/>${micro(155,620,"BUSINESS CONTEXT FIRST",.74)}${micro(155,655,"ACTION ONLY INSIDE AUTHORITY",.52)}`;
  if (scene.mode === "channels") {
    const marks = [[300,430,"googleReviews","REVIEW"],[520,320,"whatsapp","MESSAGE"],[790,275,"line","CONVERSATION"],[1110,310,"messenger","MESSAGE"],[1375,430,"instagram","SOCIAL INTENT"],[1190,690,"facebook","SOCIAL INTENT"]];
    return `${titleBlock("COMMUNICATION INTELLIGENCE", "Every signal enters one business context.", "The channel logos float as live business signals — not as a logo wall.")}
      <ellipse cx="920" cy="520" rx="520" ry="300" fill="url(#halo)"/>
      ${marks.map(([x,y,key,label],i)=>`${line(`M920 520 C${(920+x)/2} ${490+(i%2?60:-45)}, ${(920+x)/2} ${y}, ${x} ${y}`,.10)}<g transform="translate(${x-24} ${y-24})">${investorBrandMark(key,{x:0,y:0,size:48})}</g>${micro(x+42,y+5,label,.52)}`).join("")}
      <text x="920" y="515" text-anchor="middle" fill="#f4f5f6" font-family="Arial" font-size="25" letter-spacing="2">AVANTIQO</text>${micro(920,552,"ONE COMMUNICATION CONTEXT",.72,"middle")}`;
  }
  if (scene.mode === "communicationContext") {
    const labs=[[410,405,"CUSTOMER"],[610,315,"COMMERCIAL"],[865,280,"OPERATIONS"],[1140,320,"FINANCE"],[1380,420,"SUPPLY CHAIN"],[1170,650,"PEOPLE"],[860,710,"REPUTATION"],[550,625,"CREATIVE"]];
    return `${titleBlock("ONE OPERATING CONTEXT", "The answer can use the whole company.", "Different domains become one shared business truth before response.")}
      ${glassPlane(720,400,390,180,"SHARED BUSINESS TRUTH","IDENTITY · STATE · CONSTRAINTS",20,.70)}
      ${labs.map(([x,y,t],i)=>`${point(x,y,i===6?5:3.5,i===6)}${micro(x+18,y+4,t,.60)}${line(`M915 500 C${(915+x)/2} ${480+(i%2?35:-30)}, ${(915+x)/2} ${y}, ${x} ${y}`,.09)}`).join("")}`;
  }
  if (scene.mode === "ai") return `${titleBlock("SPECIALIST AI ORCHESTRATION", "The models are engines. Avantiqo is the intelligence layer.", "Different specialist systems orbit one governed business context.")}
    <ellipse cx="940" cy="520" rx="520" ry="270" fill="url(#halo)"/>
    ${["OPENAI","GOOGLE AI","FLUX","RUNWAY","VEO","SEEDANCE","ELEVENLABS"].map((t,i)=>{const a=-2.65+i*.86,x=940+Math.cos(a)*410,y=520+Math.sin(a)*185;return `${point(x,y,3.5,i===3)}${micro(x+18,y+4,t,.56)}${line(`M940 520 Q${(940+x)/2} ${470+(i%2?75:-45)} ${x} ${y}`,.09)}`;}).join("")}
    ${glassPlane(790,430,300,150,"AVANTIQO","ORCHESTRATION · GOVERNANCE",18,.70)}`;
  if (scene.mode === "communicationAction") return `${titleBlock("COMMUNICATION → ACTION", "The reply is only the beginning.", "When policy allows, Avantiqo can complete the business action behind the answer.")}
    <text x="210" y="535" fill="#f3f4f5" font-family="Arial" font-size="30">MESSAGE</text>${point(425,525,5)}${line("M440 525 H815",.22)}<text x="860" y="535" fill="#f3f4f5" font-family="Arial" font-size="30">UNDERSTAND</text>${point(1120,525,5,true)}${line("M1135 525 H1405",.22,true)}<text x="1450" y="535" fill="#f3f4f5" font-family="Arial" font-size="30">ACT</text>${micro(900,630,"IDENTITY · INTENT · POLICY · BUSINESS STATE · CONSEQUENCE",.58,"middle")}`;
  if (scene.mode === "learning") return `${titleBlock("CLOSED LOOP INTELLIGENCE", "Every outcome returns to business memory.", "Signal → context → action → outcome → better next decision.")}
    <ellipse cx="930" cy="550" rx="390" ry="185" fill="none" stroke="#e8ecef" stroke-opacity=".15"/>${[[540,550,"SIGNAL"],[930,365,"CONTEXT"],[1320,550,"ACTION"],[930,735,"OUTCOME"]].map(([x,y,t],i)=>`${point(x,y,4,i===3)}${micro(x+20,y+4,t,.66)}`).join("")}<text x="930" y="558" text-anchor="middle" fill="#f4f5f6" font-family="Arial" font-size="28">LEARN</text>`;
  return "";
}

function crossDomainOverlay(scene) {
  if (scene.mode === "event") return `${titleBlock("OPERATING INTELLIGENCE", "One business event. One operating chain.", "The event is understood once, then reused everywhere it matters.")}
    <text x="215" y="535" fill="#f4f5f6" font-family="Arial" font-size="28">CUSTOMER ACTION</text>${point(510,525,5)}${line("M525 525 H835",.20)}<text x="885" y="535" fill="#f4f5f6" font-family="Arial" font-size="28">ONE CONTEXT</text>${point(1125,525,5,true)}${line("M1140 525 H1390",.20,true)}<text x="1440" y="535" fill="#f4f5f6" font-family="Arial" font-size="28">CONSEQUENCES</text>`;
  if (scene.mode === "domainGlass") return `${titleBlock("OPERATING INTELLIGENCE", `${scene.domain} receives exactly what it needs.`, "A domain-specific transparent surface appears only when the information benefits from structure.")}
    ${glassPlane(480,330,920,360,scene.domain,scene.detail,42,.84)}${micro(555,640,"INPUT · SHARED BUSINESS EVENT",.48)}${micro(1110,640,"OUTPUT · ACCOUNTABLE DOMAIN ACTION",.48)}${point(940,585,5,true)}`;
  if (scene.mode === "domainClean") return `${titleBlock("OPERATING INTELLIGENCE", `${scene.domain} receives exactly what it needs.`, "This beat stays open and cinematic — no panel — so the footage breathes.")}
    <text x="180" y="560" fill="#f4f5f6" font-family="Arial" font-size="74" font-weight="400">${esc(scene.domain)}</text><rect x="185" y="600" width="760" height="1" fill="url(#platinum)"/>${micro(190,655,scene.detail,.70)}${point(1030,595,5,true)}${line("M945 600 H1015",.18,true)}`;
  if (scene.mode === "industry") return `${titleBlock("ONE OPERATING ARCHITECTURE", "Different industries. Same intelligence foundation.", "The imagery changes; the architecture underneath stays coherent.")}
    ${[[405,455,"RESTAURANT"],[710,350,"HOTEL"],[1110,350,"FIELD SERVICE"],[1410,465,"HEALTHCARE"]].map(([x,y,t])=>`${point(x,y,4)}${micro(x+20,y+4,t,.68)}${line(`M925 545 Q${(925+x)/2} 470 ${x} ${y}`,.10)}`).join("")}<text x="925" y="552" text-anchor="middle" fill="#f4f5f6" font-family="Arial" font-size="28">ONE FOUNDATION</text>${micro(925,590,"CONTEXT · PERMISSIONS · EVIDENCE · WORKFLOW",.66,"middle")}`;
  if (scene.mode === "governance") return `${titleBlock("GOVERNANCE", "Autonomy is a business control — not an on/off switch.", "The organization decides how far Avantiqo may go for each action.")}
    ${glassPlane(250,375,420,190,"ADVISE","RECOMMEND · EXPLAIN",-18,.46)}${glassPlane(750,345,430,220,"APPROVAL","PREPARE · WAIT FOR AUTHORITY",10,.70)}${glassPlane(1270,375,410,190,"AUTONOMOUS","EXECUTE INSIDE POLICY",24,.88)}
    <rect x="340" y="690" width="1040" height="1" fill="url(#platinum)"/>${["AUTHORITY","COST","POLICY","EVIDENCE","AUDIT"].map((t,i)=>micro(360+i*245,735,t,.58)).join("")}`;
  return "";
}

function studioOverlay(scene) {
  if (scene.mode === "objective") return `${titleBlock("BUSINESS OBJECTIVE", "Start with the outcome.", "Launch a premium campaign that grows qualified demand without sacrificing margin.")}
    <text x="150" y="485" fill="#f3f4f5" font-family="Arial" font-size="58">GROW QUALIFIED DEMAND</text><rect x="150" y="525" width="1060" height="1" fill="url(#platinum)"/>${micro(155,585,"PROTECT MARGIN",.74)}${micro(485,585,"PRESERVE BRAND",.64)}${micro(820,585,"STAY INSIDE BUDGET",.64)}${micro(1210,585,"FINITE CAMPAIGN",.52)}`;
  if (scene.mode === "territoryGlass") return `${titleBlock("CREATIVE STUDIO", "Strategy before generation.", "Three creative territories materialize with different depth — not three identical cards.")}
    ${glassPlane(220,360,450,280,"STATUS","BOLD · SCARCE · ASPIRATIONAL",-32,.60)}${glassPlane(735,305,500,350,"CRAFT","PROCESS · DETAIL · PROVENANCE",8,.92)}${glassPlane(1290,390,380,245,"HUMAN","EMOTION · IDENTITY · BELONGING",30,.52)}
    ${point(970,700,5,true)}${micro(970,748,"AVANTIQO SELECTS THE STRONGEST WORLD",.78,"middle")}`;
  if (scene.mode === "productionFullBleed") return `${titleBlock("SPECIALIST PRODUCTION", "The actual Creative Studio output becomes the movie.", "No screenshot. No browser frame. The real produced film takes over the screen.")}
    <text x="110" y="930" fill="#f4f5f6" fill-opacity=".84" font-family="Arial" font-size="17" letter-spacing="3">HERO FILM · SHORT ADS · SOCIAL · STILLS · LANDING · EMAIL · VOICE · MUSIC</text>`;
  if (scene.mode === "marketing") return `${titleBlock("AUTONOMOUS MARKETING", "Avantiqo decides how the campaign should move.", "Audience, geography, channel, timing, budget and destination reason from business readiness.")}
    <ellipse cx="920" cy="545" rx="525" ry="270" fill="url(#halo)"/>${[[440,430,"AUDIENCE"],[700,330,"GEOGRAPHY"],[1015,315,"BUDGET"],[1320,395,"CHANNEL"],[1260,665,"TIMING"],[720,700,"DESTINATION"]].map(([x,y,t],i)=>`${point(x,y,4,i===2)}${micro(x+18,y+4,t,.66)}${line(`M920 545 Q${(920+x)/2} ${500+(i%2?45:-30)} ${x} ${y}`,.09)}`).join("")} ${glassPlane(790,455,300,160,"BUSINESS READINESS","CONSTRAINS · PRIORITIZES · GOVERNS",16,.60)}`;
  if (scene.mode === "launchFullBleed") {
    const marks=[[410,730,"facebook"],[610,690,"instagram"],[815,735,"googleAds"],[1030,690,"tiktok"],[1240,735,"youtube"],[1450,695,"linkedin"]];
    return `${titleBlock("LAUNCH", "Approve once. Execute everywhere allowed.", "The real campaign keeps playing while the channel marks float into the scene.")}${marks.map(([x,y,key])=>`<g transform="translate(${x} ${y})">${investorBrandMark(key,{x:0,y:0,size:46})}</g>`).join("")}<rect x="380" y="805" width="1120" height="1" fill="url(#platinum)"/>${micro(940,850,"CREATE  →  PUBLISH  →  MEASURE  →  LEARN  →  ACT",.72,"middle")}`;
  if (scene.mode === "studioLearning") return `${titleBlock("CLOSED LOOP", "Results change the next decision.", "Creative, audience, timing and spend adapt instead of resetting every campaign.")}
    <ellipse cx="930" cy="555" rx="395" ry="185" fill="none" stroke="#e8ecef" stroke-opacity=".15"/>${[[535,555,"CREATE"],[930,370,"PUBLISH"],[1325,555,"MEASURE"],[930,740,"LEARN"]].map(([x,y,t],i)=>`${point(x,y,4,i===3)}${micro(x+20,y+4,t,.68)}`).join("")}<text x="930" y="563" text-anchor="middle" fill="#f4f5f6" font-family="Arial" font-size="28">NEXT BEST ACTION</text>`;
  return "";
}

function overlaySvg(chapterId, scene) {
  let body = "";
  if (chapterId === "business_partner") body = businessOverlay(scene);
  if (chapterId === "communication") body = communicationOverlay(scene);
  if (chapterId === "cross_domain") body = crossDomainOverlay(scene);
  if (chapterId === "studio") body = studioOverlay(scene);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${defs()}${body}</svg>`);
}

async function overlayRaw(directory, chapterId, scene) {
  if (scene.mode === "clean") return null;
  const target = path.join(directory, `${chapterId}-${scene.id}.rgba`);
  await sharp(overlaySvg(chapterId, scene)).ensureAlpha().raw().toFile(target);
  return target;
}

async function posterLightTexture(directory) {
  const response = await fetch(await signed(SOURCES.studioPoster), { cache: "no-store" });
  if (!response.ok) throw new Error(`DYNAMIC_LUXURY_POSTER_FETCH_FAILED:${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const target = path.join(directory, "poster-light-texture.rgba");
  await sharp(bytes).resize(1920, 1080, { fit: "cover", position: "attention" }).blur(34).modulate({ saturation: 0.42, brightness: 0.48 }).ensureAlpha().raw().toFile(target);
  return target;
}

async function renderScene(ffmpeg, directory, chapterId, scene, posterTexture) {
  const output = path.join(directory, `${chapterId}-${scene.id}.mp4`);
  const sourceUrl = await signed(SOURCES[scene.source]);
  const overlay = await overlayRaw(directory, chapterId, scene);
  const duration = scene.frames / FPS;
  const fadeOut = Math.max(0.75, duration - 0.48);
  const fullBleedStudio = chapterId === "studio" && (scene.mode === "productionFullBleed" || scene.mode === "launchFullBleed");

  if (!overlay) {
    await run(ffmpeg, ["-y", ...THREADS, "-stream_loop", "-1", "-i", sourceUrl, "-vf", `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=${FPS},setsar=1,eq=contrast=1.05:saturation=.84:brightness=-.025,format=yuv420p`, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-r", String(FPS), "-frames:v", String(scene.frames), output]);
    return output;
  }

  const args = ["-y", ...THREADS, "-stream_loop", "-1", "-i", sourceUrl, "-stream_loop", "-1", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "1920x1080", "-framerate", String(FPS), "-i", overlay];
  let filter = `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=${FPS},setsar=1,eq=contrast=${fullBleedStudio ? "1.03" : "1.06"}:saturation=${fullBleedStudio ? ".92" : ".78"}:brightness=${fullBleedStudio ? "-.015" : "-.035"}[base];[1:v]fade=t=in:st=0.22:d=0.38:alpha=1,fade=t=out:st=${fadeOut}:d=0.36:alpha=1[ov];`;

  if (chapterId === "studio" && scene.mode === "territoryGlass" && posterTexture) {
    args.push("-stream_loop", "-1", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "1920x1080", "-framerate", String(FPS), "-i", posterTexture);
    filter += `[2:v]colorchannelmixer=aa=.16,fade=t=in:st=0.45:d=0.70:alpha=1,fade=t=out:st=${Math.max(0.90, duration - 0.95)}:d=0.65:alpha=1[tex];[base][tex]overlay=0:0:shortest=0[bt];[bt][ov]overlay=x='3*sin(t*0.19)':y='2*sin(t*0.13)':shortest=0,format=yuv420p[v]`;
  } else {
    filter += `[base][ov]overlay=x='3*sin(t*0.19)':y='2*sin(t*0.13)':shortest=0,format=yuv420p[v]`;
  }

  args.push("-filter_complex", filter, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", fullBleedStudio ? "16" : "17", "-r", String(FPS), "-frames:v", String(scene.frames), output);
  await run(ffmpeg, args);
  return output;
}

async function concatChapter(ffmpeg, files, frames, output) {
  const args = ["-y", ...THREADS];
  files.forEach((file) => args.push("-i", file));
  const prep = files.map((_, index) => `[${index}:v]fps=${FPS},setpts=PTS-STARTPTS[v${index}]`).join(";");
  const inputs = files.map((_, index) => `[v${index}]`).join("");
  args.push("-filter_complex", `${prep};${inputs}concat=n=${files.length}:v=1:a=0,format=yuv420p[v]`, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-r", String(FPS), "-frames:v", String(frames), output);
  await run(ffmpeg, args, 680000);
}

export const AvantiqoInvestorFilmLuxuryChaptersRuntimeV4 = Object.freeze({
  CONTRACT,
  CHAPTERS,
  async status() {
    const chapters = {};
    for (const [id, chapter] of Object.entries(CHAPTERS)) chapters[id] = { output: chapter.output, ready: await exists(chapter.output), frames: chapter.frames };
    return {
      contract: CONTRACT,
      chapters,
      visual_system: {
        repeated_card_layout: false,
        glass_used_selectively: true,
        floating_authentic_channel_marks: true,
        full_bleed_real_studio_video: true,
        spatial_data_flows: true,
        clean_breathing_shots: true,
        poster_shown_as_screenshot: false,
        poster_used_only_as_abstract_light_texture: true,
        image_generation: false,
      },
    };
  },
  async render(chapterId) {
    const chapter = CHAPTERS[chapterId];
    if (!chapter) throw new Error(`DYNAMIC_LUXURY_CHAPTER_UNKNOWN:${chapterId}`);
    const ffmpeg = resolveCreativeFfmpegPath();
    const ffprobe = resolveCreativeFfprobePath();
    if (!ffmpeg || !ffprobe) throw new Error("DYNAMIC_LUXURY_MEDIA_BINARY_NOT_READY");

    for (const scene of chapter.scenes) {
      if (!(await exists(SOURCES[scene.source]))) throw new Error(`DYNAMIC_LUXURY_SOURCE_NOT_READY:${scene.source}`);
    }

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), `avantiqo-dynamic-luxury-${chapterId}-`));
    try {
      const posterTexture = chapterId === "studio" ? await posterLightTexture(directory) : null;
      const files = [];
      for (const scene of chapter.scenes) files.push(await renderScene(ffmpeg, directory, chapterId, scene, posterTexture));
      const local = path.join(directory, `${chapterId}-master.mp4`);
      await concatChapter(ffmpeg, files, chapter.frames, local);
      const media = await probe(ffprobe, local);
      const video = (media.streams || []).find((stream) => stream.codec_type === "video");
      const frameCount = Number(video?.nb_read_frames || 0);
      const duration = Number(media.format?.duration || 0);
      if (!video || Number(video.width) !== 1920 || Number(video.height) !== 1080) throw new Error(`DYNAMIC_LUXURY_DIMENSIONS_INVALID:${video?.width}x${video?.height}`);
      if (video.r_frame_rate !== "24/1") throw new Error(`DYNAMIC_LUXURY_FPS_INVALID:${video.r_frame_rate}`);
      if (frameCount !== chapter.frames) throw new Error(`DYNAMIC_LUXURY_FRAMES_INVALID:${frameCount}/${chapter.frames}`);
      const stored = await upload(chapter.output, local, { chapter: chapterId, exact_frames: frameCount, fps: FPS, duration_seconds: duration, visual_language: "DYNAMIC_PLATINUM_TITANIUM_CHAMPAGNE" });
      return {
        success: true,
        contract: CONTRACT,
        chapter: chapterId,
        output_path: chapter.output,
        ...stored,
        technical_qc: { width: Number(video.width), height: Number(video.height), fps: video.r_frame_rate, frames: frameCount, duration_seconds: duration },
        visual_system: { repeated_card_layout: false, glass_used_selectively: true, floating_authentic_channel_marks: true, full_bleed_real_studio_video: true, clean_breathing_shots: true },
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
});
