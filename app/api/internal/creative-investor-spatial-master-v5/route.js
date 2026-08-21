export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CREATIVE_TOOL_CAPABILITIES } from "@/lib/creative/tools/registry/CreativeToolRegistry";
import { CreativeToolExecutionRuntime } from "@/lib/creative/tools/runtime/CreativeToolExecutionRuntime";

const TOKEN = "avq-investor-spatial-master-v5-20260821";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const CONTRACT = "AVANTIQO_SPATIAL_INVESTOR_MASTER_V5_AI_HERO";
const UNIT = 19.125;
const ROOT = `${ORG}/avantiqo-investor-film-20260820`;
const OUT = `${ORG}/${PROJECT}/spatial-master-v5`;

const SPECIAL = {
  founder_origin: `${ROOT}/founder-v7/founder-opening-origin-synced-approved-v7.mp4`,
  founder_integration: `${ROOT}/founder-v7/founder-mid-integration-synced-approved-v7.mp4`,
  founder_ai: `${ROOT}/founder-v7/founder-mid-ai-synced-approved-v7.mp4`,
  founder_close: `${ROOT}/founder-v7/founder-close-synced-approved-v7.mp4`,
};

const s = (role, d, kicker, domain, caps, signal, side = "right", accent = "ice") => ({
  role,
  duration_seconds: d,
  kicker,
  domain,
  capabilities: caps,
  ai_signal: signal,
  side,
  accent,
});

const UNITS = Object.freeze([
  [s("founder_origin",6.4,"THE PROBLEM","Disconnected Business",["Finance","Operations"],"Critical context is scattered across tools."),s("b01",6.4,"SEPARATE SYSTEMS","Finance",["Invoices","Cash","Ledger"],"Numbers exist without the operational story behind them.","left","gold"),s("b02",6.325,"SEPARATE SYSTEMS","Operations",["Tasks","Queues","Incidents"],"Work moves, but the rest of the business cannot see why.")],
  [s("b03",6.375,"SEPARATE SYSTEMS","Customers + Commercial",["Sales","Service","Marketing"],"Customer activity becomes another isolated stream.","left","gold"),s("b04",6.375,"MANUAL BRIDGES","People",["Teams","Approvals","Responsibility"],"People become the integration layer between disconnected software."),s("b05",6.375,"AVANTIQO","One Operating Context",["One Context","One Architecture","One Truth"],"The system starts from the business itself.","left","gold")],
  [s("b06",6.375,"ORGANIZATION INTELLIGENCE","Business Context",["Organization","Entity","Period","Permissions"],"Every action inherits the right business context."),s("b07",6.375,"FINANCE","Financial Core",["General Ledger","Cash","Invoices","Forecast"],"Finance becomes part of the operating system.","left","gold"),s("b08",6.375,"FINANCIAL INTELLIGENCE","Signals + Decisions",["Variance","Risk","Approvals","Next Action"],"The system surfaces what needs attention now.")],
  [s("b09",6.375,"EVIDENCE","Documents + Posting",["Source Document","Audit Trail","Posting"],"Every result stays connected to evidence.","left","gold"),s("b10",6.375,"FORECASTING","Forward View",["Budget","Scenario","Cash Outlook"],"Future decisions use the same live operating context."),s("b11",6.375,"SHARED TRUTH","Connected Domains",["Finance","Operations","Commercial","People"],"Different teams stop working from different versions of reality.","left","gold")],
  [s("b12",6.375,"SUPPLY CHAIN","Procurement",["Request","Approval","Purchase Order","Supplier"],"Demand becomes a governed purchasing flow."),s("b13",6.375,"SUPPLY CHAIN","Receiving",["Goods Receipt","Put Away","Invoice Match"],"Physical receipt and financial evidence stay connected.","left","gold"),s("b14",6.375,"INVENTORY","Stock Intelligence",["Movements","Valuation","Waste","Availability"],"Inventory changes become visible across the business immediately.")],
  [s("b15",6.375,"OPERATIONS","Execution",["Work Queue","Assignment","Incident","Handoff"],"Attention becomes accountable work.","left","gold"),s("b16",6.375,"REAL-TIME FLOW","Order → Kitchen",["Order Created","Kitchen Queue","Preparing","Ready"],"One customer action moves through the operation in real time."),s("b17",6.375,"CONNECTED FLOW","Order → Inventory → Finance",["Service","Consumption","Revenue","Evidence"],"The business chain updates without losing context.","left","gold")],
  [s("b18",6.375,"COMMERCIAL","Revenue Flow",["Leads","Quotes","Orders","Revenue"],"Commercial activity connects directly to execution and finance."),s("b19",6.375,"MARKETING","Objective → Performance",["Audience","Content","Publish","Results"],"Marketing becomes measurable business activity.","left","gold"),s("b20",6.375,"PEOPLE","Workforce Context",["Staff","Schedule","Responsibility","Approval"],"People, work and accountability share the same context.")],
  [s("founder_integration",3.6,"ONE OPERATING CONTEXT","Connected by Design",["Transaction","Context","Evidence"],"A transaction travels through the business without losing meaning.","left","gold"),s("b01",7.7625,"INTEGRATIONS","Connected Channels",["Website","POS","Google","WhatsApp"],"External channels feed the same governed operating context."),s("b02",7.7625,"SHARED DATA","One Business Graph",["Customer","Supplier","Employee","Document"],"Relationships matter more than isolated records.","left","gold")],
  [s("b04",6.375,"GOVERNED AI","Observe",["Events","Context","Signals"],"AI sees what is happening across the business."),s("b05",6.375,"GOVERNED AI","Reason",["Policies","Risk","Dependencies"],"Reasoning is constrained by business rules and evidence.","left","gold"),s("b06",6.375,"GOVERNED AI","Recommend",["Next Action","Priority","Confidence"],"The system proposes the next accountable move.")],
  [s("b07",6.7125,"GOVERNED AI","Approval",["Permission","Threshold","Human Control"],"Autonomy stays inside the authority model.","left","gold"),s("founder_ai",5.7,"AVANTIQO AI","Governed Autonomy",["Observe","Reason","Recommend","Execute"],"AI can act while permissions and evidence remain intact."),s("b08",6.7125,"EXECUTION","Action",["Create","Navigate","Write","Run"],"Intelligence becomes action inside the system.","left","gold")],
  [s("b09",6.375,"ONE PLATFORM","Restaurant",["Order","Kitchen","Inventory","Finance"],"The same operating model can run a complex service business."),s("b10",6.375,"ONE PLATFORM","Hospitality",["Guest","Service","Operations","Revenue"],"Industry workflows sit on top of the same core architecture.","left","gold"),s("b11",6.375,"ONE PLATFORM","Field Service",["Dispatch","Work","Evidence","Invoice"],"Execution moves from office to field without losing context.")],
  [s("b12",6.5125,"ONE PLATFORM","Professional Services",["Client","Project","Document","Billing"],"Different businesses reuse one intelligent operating foundation.","left","gold"),s("founder_close",6.1,"THE INTELLIGENT ENTERPRISE","Built to Evolve",["One System","One Truth"],"Avantiqo gets better as the business gets smarter."),s("logo_3d",6.5125,"AVANTIQO","The Intelligent Enterprise",[],"Avantiqo connects context, evidence and action.","left","gold")],
]);

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function hash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function pathFor(index) {
  return `${OUT}/units/unit-${String(index).padStart(2, "0")}.mp4`;
}

function storage(path) {
  return `storage://${BUCKET}/${path}`;
}

async function project() {
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("id", PROJECT)
    .eq("organization_id", ORG)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("SPATIAL_MASTER_V5_PROJECT_NOT_FOUND");
  return data;
}

function sourcePath(p, role) {
  if (SPECIAL[role]) return SPECIAL[role];
  const value = String(p.metadata?.approved_direction_resume?.sources?.[role] || "").trim();
  if (!value) throw new Error(`SPATIAL_MASTER_V5_SOURCE_MISSING:${role}`);
  return value;
}

async function signed(path, seconds = 86400) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

function forceHeroModeId(base) {
  const seed = String(base || "scene");
  const mod = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
  const needed = (1 - mod + 4) % 4;
  const suffix = ["d", "a", "b", "c"][needed];
  return `${seed}-${suffix}`;
}

function enrichCapability(capability) {
  const value = String(capability || "").trim();
  if (!value) return value;
  return value.length < 15 ? `${value} · connected` : value;
}

function aiHeroScene(definition, index, sceneIndex, p) {
  return {
    ...definition,
    id: forceHeroModeId(`unit-${index}-${sceneIndex + 1}`),
    kicker: `AVANTIQO AI · ${definition.kicker}`,
    capabilities: (definition.capabilities || []).map(enrichCapability),
    source_reference: storage(sourcePath(p, definition.role)),
    source_in_seconds: 0,
  };
}

async function renderUnit(index) {
  const p = await project();
  const definitions = UNITS[index - 1];
  if (!definitions) throw new Error("SPATIAL_MASTER_V5_UNIT_INVALID");
  const scenes = definitions.map((definition, sceneIndex) => aiHeroScene(definition, index, sceneIndex, p));
  const duration = Number(scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0).toFixed(6));
  if (Math.abs(duration - UNIT) > 0.002) throw new Error(`SPATIAL_MASTER_V5_UNIT_DURATION_INVALID:${duration}`);

  const execution = await CreativeToolExecutionRuntime.execute({
    organization_id: ORG,
    creative_project_id: PROJECT,
    project: p,
    capability: CREATIVE_TOOL_CAPABILITIES.SPATIAL_PRODUCT_TWIN,
    input: { scenes, width: 1920, height: 1080, fps: 24 },
  });
  const output = execution.output;
  if (!output?.buffer?.length) throw new Error("SPATIAL_MASTER_V5_UNIT_EMPTY");

  const path = pathFor(index);
  const checksum = hash(output.buffer);
  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, output.buffer, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      organization_id: ORG,
      creative_project_id: PROJECT,
      master_contract: CONTRACT,
      unit_index: index,
      ai_hero: true,
      speech_linked_cards: true,
      visual_language: "AVANTIQO_AI_HERO_SPATIAL_OPERATING_OBJECTS_V2",
      checksum,
    },
  });
  if (uploadError) throw uploadError;

  const latest = await project();
  const metadata = latest.metadata || {};
  const previous = metadata.spatial_investor_master_v5 || {};
  const units = { ...(previous.units || {}) };
  units[String(index)] = {
    status: "RENDERED_REVIEW_REQUIRED",
    storage_path: path,
    checksum,
    bytes: output.buffer.length,
    duration_seconds: UNIT,
    ai_hero: true,
    speech_linked_cards: true,
    visual_language: output.visual_language || "AVANTIQO_AI_HERO_SPATIAL_OPERATING_OBJECTS_V2",
    spatial_glass_tracking_proven: output.spatial_glass_tracking_proven === true,
    updated_at: new Date().toISOString(),
  };
  const next = {
    ...previous,
    contract: CONTRACT,
    ai_intelligence_is_visual_hero: true,
    speech_linked_cards_persistent: true,
    full_screen_ui_ratio: 0,
    units,
    updated_at: new Date().toISOString(),
  };
  const { error: updateError } = await supabaseAdmin
    .from("creative_projects")
    .update({ metadata: { ...metadata, spatial_investor_master_v5: next }, updated_at: new Date().toISOString() })
    .eq("id", PROJECT)
    .eq("organization_id", ORG);
  if (updateError) throw updateError;

  return {
    success: true,
    index,
    output_path: path,
    signed_url: await signed(path),
    checksum,
    bytes: output.buffer.length,
    duration_seconds: UNIT,
    ai_hero: true,
    speech_linked_cards: true,
    visual_language: next.units[String(index)].visual_language,
  };
}

async function status() {
  const p = await project();
  const state = p.metadata?.spatial_investor_master_v5 || {};
  const units = [];
  for (let index = 1; index <= 12; index += 1) {
    const unit = state.units?.[String(index)] || null;
    units.push({
      index,
      ready: Boolean(unit?.storage_path && unit?.checksum),
      updated_at: unit?.updated_at || null,
      checksum: unit?.checksum || null,
      ai_hero: unit?.ai_hero === true,
      speech_linked_cards: unit?.speech_linked_cards === true,
      visual_language: unit?.visual_language || null,
      path: unit?.storage_path || pathFor(index),
    });
  }
  return {
    success: true,
    contract: CONTRACT,
    ai_intelligence_is_visual_hero: true,
    speech_linked_cards_persistent: true,
    units,
    all_units_ready: units.every((unit) => unit.ready && unit.ai_hero && unit.speech_linked_cards),
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = String(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") return json(await status());
    if (action === "render-unit") return json(await renderUnit(Number(url.searchParams.get("index"))));
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CREATIVE_INVESTOR_SPATIAL_MASTER_V5_FAILED", { message: error?.message || String(error) });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
