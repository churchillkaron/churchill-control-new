export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CREATIVE_TOOL_CAPABILITIES,
} from "@/lib/creative/tools/registry/CreativeToolRegistry";
import {
  CreativeToolExecutionRuntime,
} from "@/lib/creative/tools/runtime/CreativeToolExecutionRuntime";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativeEdlRenderRuntime,
} from "@/lib/creative/post-production/runtime/CreativeEdlRenderRuntime";

const TOKEN = "avq-investor-spatial-master-20260821";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const MASTER_VERSION = "AVANTIQO_SPATIAL_INVESTOR_MASTER_V1";
const CHUNK_DURATION = 38.25;
const MASTER_DURATION = 237.5;
const NARRATION_START = 8;
const NARRATION_DURATION = 229.5;
const ROOT = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820`;
const OUTPUT_ROOT = `${ORGANIZATION_ID}/${PROJECT_ID}/spatial-master-v1`;

const SPECIAL_SOURCES = Object.freeze({
  founder_v7_origin: `${ROOT}/founder-v7/founder-opening-origin-synced-approved-v7.mp4`,
  founder_v7_integration: `${ROOT}/founder-v7/founder-mid-integration-synced-approved-v7.mp4`,
  founder_v7_ai: `${ROOT}/founder-v7/founder-mid-ai-synced-approved-v7.mp4`,
  founder_v7_close: `${ROOT}/founder-v7/founder-close-synced-approved-v7.mp4`,
});

const CHUNKS = Object.freeze([
  Object.freeze([
    { role: "founder_v7_origin", duration_seconds: 6.4, kicker: "THE PROBLEM", domain: "Disconnected Business", capabilities: ["Finance", "Operations"], ai_signal: "Critical context is scattered across tools.", side: "right", accent: "ice" },
    { role: "b01", duration_seconds: 6.4, kicker: "SEPARATE SYSTEMS", domain: "Finance", capabilities: ["Invoices", "Cash", "Ledger"], ai_signal: "Numbers exist without the operational story behind them.", side: "left", accent: "gold" },
    { role: "b02", duration_seconds: 6.4, kicker: "SEPARATE SYSTEMS", domain: "Operations", capabilities: ["Tasks", "Queues", "Incidents"], ai_signal: "Work moves, but the rest of the business cannot see why.", side: "right", accent: "ice" },
    { role: "b03", duration_seconds: 6.4, kicker: "SEPARATE SYSTEMS", domain: "Customers + Commercial", capabilities: ["Sales", "Service", "Marketing"], ai_signal: "Customer activity becomes another isolated stream.", side: "left", accent: "gold" },
    { role: "b04", duration_seconds: 6.4, kicker: "MANUAL BRIDGES", domain: "People", capabilities: ["Teams", "Approvals", "Responsibility"], ai_signal: "People become the integration layer between disconnected software.", side: "right", accent: "ice" },
    { role: "b05", duration_seconds: 6.25, kicker: "AVANTIQO", domain: "One Operating Context", capabilities: ["One Context", "One Architecture", "One Truth"], ai_signal: "The system starts from the business itself.", side: "left", accent: "gold" },
  ]),
  Object.freeze([
    { role: "b06", duration_seconds: 6.375, kicker: "ORGANIZATION INTELLIGENCE", domain: "Business Context", capabilities: ["Organization", "Entity", "Period", "Permissions"], ai_signal: "Every action inherits the right business context.", side: "right", accent: "ice" },
    { role: "b07", duration_seconds: 6.375, kicker: "FINANCE", domain: "Financial Core", capabilities: ["General Ledger", "Cash", "Invoices", "Forecast"], ai_signal: "Finance becomes part of the operating system, not a separate destination.", side: "left", accent: "gold" },
    { role: "b08", duration_seconds: 6.375, kicker: "FINANCIAL INTELLIGENCE", domain: "Signals + Decisions", capabilities: ["Variance", "Risk", "Approvals", "Next Action"], ai_signal: "The system surfaces what needs attention now.", side: "right", accent: "ice" },
    { role: "b09", duration_seconds: 6.375, kicker: "EVIDENCE", domain: "Documents + Posting", capabilities: ["Source Document", "Audit Trail", "Posting"], ai_signal: "Every result stays connected to evidence.", side: "left", accent: "gold" },
    { role: "b10", duration_seconds: 6.375, kicker: "FORECASTING", domain: "Forward View", capabilities: ["Budget", "Scenario", "Cash Outlook"], ai_signal: "Future decisions use the same live operating context.", side: "right", accent: "ice" },
    { role: "b11", duration_seconds: 6.375, kicker: "SHARED TRUTH", domain: "Connected Domains", capabilities: ["Finance", "Operations", "Commercial", "People"], ai_signal: "Different teams stop working from different versions of reality.", side: "left", accent: "gold" },
  ]),
  Object.freeze([
    { role: "b12", duration_seconds: 6.375, kicker: "SUPPLY CHAIN", domain: "Procurement", capabilities: ["Request", "Approval", "Purchase Order", "Supplier"], ai_signal: "Demand becomes a governed purchasing flow.", side: "right", accent: "ice" },
    { role: "b13", duration_seconds: 6.375, kicker: "SUPPLY CHAIN", domain: "Receiving", capabilities: ["Goods Receipt", "Put Away", "Invoice Match"], ai_signal: "Physical receipt and financial evidence stay connected.", side: "left", accent: "gold" },
    { role: "b14", duration_seconds: 6.375, kicker: "INVENTORY", domain: "Stock Intelligence", capabilities: ["Movements", "Valuation", "Waste", "Availability"], ai_signal: "Inventory changes become visible across the business immediately.", side: "right", accent: "ice" },
    { role: "b15", duration_seconds: 6.375, kicker: "OPERATIONS", domain: "Execution", capabilities: ["Work Queue", "Assignment", "Incident", "Handoff"], ai_signal: "Attention becomes accountable work.", side: "left", accent: "gold" },
    { role: "b16", duration_seconds: 6.375, kicker: "REAL-TIME FLOW", domain: "Order → Kitchen", capabilities: ["Order Created", "Kitchen Queue", "Preparing", "Ready"], ai_signal: "One customer action can move through the operation in real time.", side: "right", accent: "ice" },
    { role: "b17", duration_seconds: 6.375, kicker: "CONNECTED FLOW", domain: "Order → Inventory → Finance", capabilities: ["Service", "Consumption", "Revenue", "Evidence"], ai_signal: "The business chain updates without losing context.", side: "left", accent: "gold" },
  ]),
  Object.freeze([
    { role: "b18", duration_seconds: 7.172, kicker: "COMMERCIAL", domain: "Revenue Flow", capabilities: ["Leads", "Quotes", "Orders", "Revenue"], ai_signal: "Commercial activity connects directly to execution and finance.", side: "right", accent: "ice" },
    { role: "b19", duration_seconds: 7.172, kicker: "MARKETING", domain: "Objective → Performance", capabilities: ["Audience", "Content", "Publish", "Results"], ai_signal: "Marketing becomes measurable business activity.", side: "left", accent: "gold" },
    { role: "b20", duration_seconds: 7.172, kicker: "PEOPLE", domain: "Workforce Context", capabilities: ["Staff", "Schedule", "Responsibility", "Approval"], ai_signal: "People, work and accountability share the same context.", side: "right", accent: "ice" },
    { role: "founder_v7_integration", duration_seconds: 3.6, kicker: "ONE OPERATING CONTEXT", domain: "Connected by Design", capabilities: ["Transaction", "Context", "Evidence"], ai_signal: "A transaction travels through the business without losing meaning.", side: "left", accent: "gold" },
    { role: "b01", duration_seconds: 6.567, kicker: "INTEGRATIONS", domain: "Connected Channels", capabilities: ["Website", "POS", "Google", "WhatsApp"], ai_signal: "External channels feed the same governed operating context.", side: "right", accent: "ice" },
    { role: "b02", duration_seconds: 6.567, kicker: "SHARED DATA", domain: "One Business Graph", capabilities: ["Customer", "Supplier", "Employee", "Document"], ai_signal: "Relationships matter more than isolated records.", side: "left", accent: "gold" },
  ]),
  Object.freeze([
    { role: "b04", duration_seconds: 6.047, kicker: "GOVERNED AI", domain: "Observe", capabilities: ["Events", "Context", "Signals"], ai_signal: "AI sees what is happening across the business.", side: "right", accent: "ice" },
    { role: "b05", duration_seconds: 6.047, kicker: "GOVERNED AI", domain: "Reason", capabilities: ["Policies", "Risk", "Dependencies"], ai_signal: "Reasoning is constrained by business rules and evidence.", side: "left", accent: "gold" },
    { role: "b06", duration_seconds: 6.047, kicker: "GOVERNED AI", domain: "Recommend", capabilities: ["Next Action", "Priority", "Confidence"], ai_signal: "The system proposes the next accountable move.", side: "right", accent: "ice" },
    { role: "b07", duration_seconds: 6.047, kicker: "GOVERNED AI", domain: "Approval", capabilities: ["Permission", "Threshold", "Human Control"], ai_signal: "Autonomy stays inside the authority model.", side: "left", accent: "gold" },
    { role: "founder_v7_ai", duration_seconds: 5.7, kicker: "AVANTIQO AI", domain: "Governed Autonomy", capabilities: ["Observe", "Reason", "Recommend", "Execute"], ai_signal: "AI can act while permissions and evidence remain intact.", side: "right", accent: "ice" },
    { role: "b08", duration_seconds: 4.181, kicker: "EXECUTION", domain: "Action", capabilities: ["Create", "Navigate", "Write", "Run"], ai_signal: "Intelligence becomes action inside the system.", side: "left", accent: "gold" },
    { role: "b09", duration_seconds: 4.181, kicker: "EVIDENCE", domain: "Accountable AI", capabilities: ["Audit", "History", "Outcome"], ai_signal: "Every automated action leaves a trace.", side: "right", accent: "ice" },
  ]),
  Object.freeze([
    { role: "b09", duration_seconds: 7.03125, kicker: "ONE PLATFORM", domain: "Restaurant", capabilities: ["Order", "Kitchen", "Inventory", "Finance"], ai_signal: "The same operating model can run a complex service business.", side: "right", accent: "ice" },
    { role: "b10", duration_seconds: 7.03125, kicker: "ONE PLATFORM", domain: "Hospitality", capabilities: ["Guest", "Service", "Operations", "Revenue"], ai_signal: "Industry workflows sit on top of the same core architecture.", side: "left", accent: "gold" },
    { role: "b11", duration_seconds: 7.03125, kicker: "ONE PLATFORM", domain: "Field Service", capabilities: ["Dispatch", "Work", "Evidence", "Invoice"], ai_signal: "Execution can move from office to field without losing context.", side: "right", accent: "ice" },
    { role: "b12", duration_seconds: 7.03125, kicker: "ONE PLATFORM", domain: "Professional Services", capabilities: ["Client", "Project", "Document", "Billing"], ai_signal: "Different businesses reuse one intelligent operating foundation.", side: "left", accent: "gold" },
    { role: "founder_v7_close", duration_seconds: 5.35, kicker: "THE INTELLIGENT ENTERPRISE", domain: "Built to Evolve", capabilities: ["One System", "One Truth"], ai_signal: "Avantiqo gets better as the business gets smarter.", side: "right", accent: "ice" },
    { role: "logo_3d", duration_seconds: 4.775, kicker: "AVANTIQO", domain: "The Intelligent Enterprise", capabilities: [], ai_signal: "", side: "left", accent: "gold" },
  ]),
]);

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function chunkPath(index) {
  return `${OUTPUT_ROOT}/chunks/chunk-${String(index).padStart(2, "0")}.mp4`;
}

function storage(path) {
  return `storage://${BUCKET}/${path}`;
}

async function loadProject() {
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("SPATIAL_MASTER_PROJECT_NOT_FOUND");
  return data;
}

function sourcePath(project, role) {
  if (SPECIAL_SOURCES[role]) return SPECIAL_SOURCES[role];
  const sources = project.metadata?.approved_direction_resume?.sources || {};
  const path = String(sources[role] || "").trim();
  if (!path) throw new Error(`SPATIAL_MASTER_SOURCE_MISSING:${role}`);
  return path;
}

function materializedScenes(project, index) {
  const definitions = CHUNKS[index - 1];
  if (!definitions) throw new Error(`SPATIAL_MASTER_CHUNK_INVALID:${index}`);
  const scenes = definitions.map((scene, sceneIndex) => ({
    ...scene,
    id: `master-${index}-${sceneIndex + 1}`,
    source_reference: storage(sourcePath(project, scene.role)),
    source_in_seconds: 0,
  }));
  const duration = Number(scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0).toFixed(6));
  if (Math.abs(duration - CHUNK_DURATION) > 0.002) {
    throw new Error(`SPATIAL_MASTER_CHUNK_DURATION_INVALID:${index}:${duration}`);
  }
  return scenes;
}

async function pathReady(path) {
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(dir, {
    search: name,
    limit: 10,
  });
  if (error) throw error;
  return (data || []).some((item) => item.name === name);
}

async function signedUrl(path, seconds = 86400) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function persistVideo({ project, path, output, label, identityKey, identityValue, metadata = {} }) {
  const buffer = output.buffer;
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      organization_id: ORGANIZATION_ID,
      creative_project_id: PROJECT_ID,
      master_contract: MASTER_VERSION,
      checksum,
    },
  });
  if (error) throw error;

  const result = await AssetGraphRepository.createOrFindByMetadataIdentity({
    metadata_key: identityKey,
    metadata_value: identityValue,
    node: createCreativeAssetNode({
      organization_id: ORGANIZATION_ID,
      creative_project_id: PROJECT_ID,
      type: CREATIVE_ASSET_NODE_TYPES.VIDEO,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: label,
      description: "Live-environment spatial-intelligence master segment. Full-screen product UI is forbidden.",
      url: creativeStorageUri(BUCKET, path),
      storage_path: path,
      lineage: {
        source: "creative_spatial_product_twin",
        capability: CREATIVE_TOOL_CAPABILITIES.SPATIAL_PRODUCT_TWIN,
        generation_version: 1,
      },
      technical: {
        mime_type: "video/mp4",
        width: 1920,
        height: 1080,
        duration_seconds: output.duration_seconds,
        checksum,
        file_size_bytes: buffer.length,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: false,
        approved: false,
        notes: "Master workprint segment. Final release review remains required.",
      },
      metadata: {
        ...metadata,
        master_contract: MASTER_VERSION,
        full_screen_ui_ratio: 0,
        spatial_glass_tracking_proven: output.spatial_glass_tracking_proven === true,
        design_policy: output.design_policy,
      },
    }),
  });

  return { node: result.node, checksum, bytes: buffer.length };
}

async function renderChunk(index) {
  const project = await loadProject();
  const scenes = materializedScenes(project, index);
  const execution = await CreativeToolExecutionRuntime.execute({
    organization_id: ORGANIZATION_ID,
    creative_project_id: PROJECT_ID,
    project,
    capability: CREATIVE_TOOL_CAPABILITIES.SPATIAL_PRODUCT_TWIN,
    input: { scenes, width: 1920, height: 1080, fps: 24 },
  });
  const output = execution.output;
  if (!output?.buffer?.length) throw new Error(`SPATIAL_MASTER_CHUNK_EMPTY:${index}`);
  const path = chunkPath(index);
  const identityValue = hash({
    master_contract: MASTER_VERSION,
    chunk_index: index,
    scenes: scenes.map((scene) => ({
      role: scene.role,
      duration_seconds: scene.duration_seconds,
      domain: scene.domain,
      capabilities: scene.capabilities,
      ai_signal: scene.ai_signal,
    })),
    checksum: crypto.createHash("sha256").update(output.buffer).digest("hex"),
  });
  const saved = await persistVideo({
    project,
    path,
    output,
    label: `Avantiqo Spatial Master — Act ${index}`,
    identityKey: "spatial_master_chunk_identity",
    identityValue,
    metadata: {
      spatial_master_chunk_identity: identityValue,
      spatial_master_chunk_index: index,
      timeline_in_seconds: Number((NARRATION_START + (index - 1) * CHUNK_DURATION).toFixed(6)),
      timeline_out_seconds: Number((NARRATION_START + index * CHUNK_DURATION).toFixed(6)),
    },
  });

  const metadata = project.metadata || {};
  const previous = metadata.spatial_investor_master || {};
  const chunks = { ...(previous.chunks || {}) };
  chunks[String(index)] = {
    status: "RENDERED_REVIEW_REQUIRED",
    storage_path: path,
    asset_node_id: saved.node.id,
    checksum: saved.checksum,
    duration_seconds: output.duration_seconds,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({
      metadata: {
        ...metadata,
        spatial_investor_master: {
          ...previous,
          contract: MASTER_VERSION,
          full_master_requested_by_user: true,
          sound_required: true,
          full_screen_ui_ratio: 0,
          chunks,
          updated_at: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;

  return {
    index,
    output_path: path,
    signed_url: await signedUrl(path),
    duration_seconds: output.duration_seconds,
    full_screen_ui_ratio: output.full_screen_ui_ratio,
    spatial_glass_tracking_proven: output.spatial_glass_tracking_proven,
    ...saved,
  };
}

function typeForRole(role) {
  if (role === "narration") return CREATIVE_ASSET_NODE_TYPES.VOICE;
  if (role === "score") return CREATIVE_ASSET_NODE_TYPES.MUSIC;
  return CREATIVE_ASSET_NODE_TYPES.VIDEO;
}

async function ensureSourceNode({ role, path, duration, approved = false }) {
  const identityValue = hash({ master_contract: MASTER_VERSION, role, path });
  const type = typeForRole(role);
  const result = await AssetGraphRepository.createOrFindByMetadataIdentity({
    metadata_key: "spatial_master_source_identity",
    metadata_value: identityValue,
    node: createCreativeAssetNode({
      organization_id: ORGANIZATION_ID,
      creative_project_id: PROJECT_ID,
      type,
      status: approved ? CREATIVE_ASSET_NODE_STATUS.APPROVED : CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: `Spatial master source — ${role}`,
      description: "Bound source for Avantiqo spatial investor master.",
      url: creativeStorageUri(BUCKET, path),
      storage_path: path,
      lineage: {
        source: "spatial_investor_master",
        capability: "creative.timeline.render",
        generation_version: 1,
      },
      technical: {
        mime_type: type === CREATIVE_ASSET_NODE_TYPES.VIDEO ? "video/mp4" : "audio/mpeg",
        duration_seconds: duration,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: approved,
        approved,
        notes: approved ? "Locked approved source." : "Generated workprint source.",
      },
      metadata: {
        spatial_master_source_identity: identityValue,
        spatial_master_source_role: role,
        master_contract: MASTER_VERSION,
      },
    }),
  });
  return result.node;
}

async function ensureTimeline({ project, sourceNodes }) {
  const edits = [];
  let cursor = 0;
  const logo = sourceNodes.get("logo_3d");
  edits.push({
    index: 1,
    source_asset_node_id: logo.id,
    source_url: logo.url,
    source_in_seconds: 0,
    source_out_seconds: 8,
    timeline_in_seconds: 0,
    timeline_out_seconds: 8,
    duration_seconds: 8,
    editorial_label: "3D logo opening",
  });
  cursor = 8;

  for (let index = 1; index <= CHUNKS.length; index += 1) {
    const node = sourceNodes.get(`chunk_${index}`);
    const start = cursor;
    const end = Number((start + CHUNK_DURATION).toFixed(6));
    edits.push({
      index: edits.length + 1,
      source_asset_node_id: node.id,
      source_url: node.url,
      source_in_seconds: 0,
      source_out_seconds: CHUNK_DURATION,
      timeline_in_seconds: start,
      timeline_out_seconds: end,
      duration_seconds: CHUNK_DURATION,
      editorial_label: `Spatial intelligence act ${index}`,
    });
    cursor = end;
  }

  if (Math.abs(cursor - MASTER_DURATION) > 0.002) {
    throw new Error(`SPATIAL_MASTER_TIMELINE_DURATION_INVALID:${cursor}`);
  }

  const identityValue = hash({ master_contract: MASTER_VERSION, edits });
  const result = await AssetGraphRepository.createOrFindByMetadataIdentity({
    metadata_key: "spatial_master_timeline_identity",
    metadata_value: identityValue,
    node: createCreativeAssetNode({
      organization_id: ORGANIZATION_ID,
      creative_project_id: PROJECT_ID,
      type: CREATIVE_ASSET_NODE_TYPES.TIMELINE,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: "Avantiqo Investor Film — Spatial Master Timeline v1",
      description: "237.5-second Studio timeline using live footage, tracked spatial intelligence, locked Cedar narration and approved score.",
      lineage: {
        source: "spatial_investor_master",
        capability: "creative.timeline.render",
        generation_version: 1,
      },
      technical: {
        mime_type: "application/vnd.avantiqo.edl+json",
        duration_seconds: MASTER_DURATION,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: false,
        approved: false,
        notes: "Full workprint requested by user. Release approval remains separate.",
      },
      metadata: {
        format: "AVANTIQO_EDL_V1",
        timeline_identity: identityValue,
        spatial_master_timeline_identity: identityValue,
        master_contract: MASTER_VERSION,
        edit_decision_list: edits,
        total_duration_seconds: MASTER_DURATION,
        clip_count: edits.length,
        full_screen_ui_ratio: 0,
        narration_start_seconds: NARRATION_START,
        narration_duration_seconds: NARRATION_DURATION,
        semantic_speech_triggering: true,
        release_approval_required: true,
      },
    }),
  });
  return result.node;
}

async function assembleMaster() {
  const project = await loadProject();
  for (let index = 1; index <= CHUNKS.length; index += 1) {
    if (!(await pathReady(chunkPath(index)))) {
      throw new Error(`SPATIAL_MASTER_CHUNK_NOT_READY:${index}`);
    }
  }

  const config = project.metadata?.approved_direction_resume || {};
  const sources = config.sources || {};
  const logoPath = String(sources.logo_3d || "").trim();
  const narrationPath = String(sources.narration || "").trim();
  const scorePath = String(sources.score || "").trim();
  if (!logoPath || !narrationPath || !scorePath) {
    throw new Error("SPATIAL_MASTER_LOCKED_AUDIO_OR_LOGO_MISSING");
  }

  const sourceNodes = new Map();
  sourceNodes.set("logo_3d", await ensureSourceNode({ role: "logo_3d", path: logoPath, duration: 8, approved: true }));
  sourceNodes.set("narration", await ensureSourceNode({ role: "narration", path: narrationPath, duration: NARRATION_DURATION, approved: true }));
  sourceNodes.set("score", await ensureSourceNode({ role: "score", path: scorePath, duration: MASTER_DURATION, approved: true }));
  for (let index = 1; index <= CHUNKS.length; index += 1) {
    sourceNodes.set(`chunk_${index}`, await ensureSourceNode({
      role: `chunk_${index}`,
      path: chunkPath(index),
      duration: CHUNK_DURATION,
      approved: false,
    }));
  }

  const timeline = await ensureTimeline({ project, sourceNodes });
  const baseProfile = config.export_profile || {};
  const exportProfile = {
    ...baseProfile,
    id: "avantiqo-spatial-investor-master-v1",
    name: "Avantiqo Investor Film — Spatial Intelligence Master v1",
    width: 1920,
    height: 1080,
    frame_rate: 24,
    video_codec: "libx264",
    video_bitrate: "12M",
    pixel_format: "yuv420p",
    audio_codec: "aac",
    audio_bitrate: "256k",
    sample_rate: 48000,
    audio_channels: 2,
    audio_channel_layout: "stereo",
    audio_mix_normalize: false,
    include_source_audio: false,
    subtitle_mode: "none",
  };

  const tracks = {
    audio: [
      {
        asset_node_id: sourceNodes.get("narration").id,
        role: "VOICE",
        timeline_in_seconds: NARRATION_START,
        source_in_seconds: 0,
        duration_seconds: NARRATION_DURATION,
        gain: 1,
      },
      {
        asset_node_id: sourceNodes.get("score").id,
        role: "MUSIC",
        timeline_in_seconds: 0,
        source_in_seconds: 0,
        duration_seconds: MASTER_DURATION,
        gain: 0.22,
      },
    ],
    overlays: [],
    subtitle_asset_node_id: null,
  };

  const result = await CreativeEdlRenderRuntime.render({
    organization_id: ORGANIZATION_ID,
    timeline_asset_node_id: timeline.id,
    export_profile: exportProfile,
    tracks,
    force: true,
    policy: {
      render_bucket: BUCKET,
      render_timeout_ms: 720000,
    },
  });
  const render = result.render;
  if (!render?.storage_path) throw new Error("SPATIAL_MASTER_FINAL_RENDER_MISSING");

  const metadata = project.metadata || {};
  const previous = metadata.spatial_investor_master || {};
  const next = {
    ...previous,
    contract: MASTER_VERSION,
    status: render.status === CREATIVE_ASSET_NODE_STATUS.REJECTED
      ? "TECHNICAL_QC_FAILED"
      : "RENDERED_REVIEW_REQUIRED",
    timeline_asset_node_id: timeline.id,
    render_asset_node_id: render.id,
    storage_path: render.storage_path,
    duration_seconds: render.technical?.duration_seconds || MASTER_DURATION,
    checksum: render.technical?.checksum || null,
    full_screen_ui_ratio: 0,
    sound: {
      narration: { start_seconds: NARRATION_START, duration_seconds: NARRATION_DURATION, gain: 1 },
      score: { start_seconds: 0, duration_seconds: MASTER_DURATION, gain: 0.22 },
      source_audio_enabled: false,
    },
    full_master_requested_by_user: true,
    human_release_approval_inferred: false,
    release_review_required: true,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({ metadata: { ...metadata, spatial_investor_master: next }, updated_at: new Date().toISOString() })
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;

  return {
    timeline_asset_node_id: timeline.id,
    render_asset_node_id: render.id,
    storage_path: render.storage_path,
    signed_url: await signedUrl(render.storage_path),
    status: next.status,
    technical_qc: result.technical_qc || render.metadata?.technical_qc || null,
    duration_seconds: next.duration_seconds,
    sound: next.sound,
    full_screen_ui_ratio: 0,
  };
}

async function status() {
  const project = await loadProject();
  const chunks = [];
  for (let index = 1; index <= CHUNKS.length; index += 1) {
    chunks.push({
      index,
      ready: await pathReady(chunkPath(index)),
      path: chunkPath(index),
    });
  }
  const master = project.metadata?.spatial_investor_master || {};
  let masterUrl = null;
  if (master.storage_path && await pathReady(master.storage_path)) {
    masterUrl = await signedUrl(master.storage_path);
  }
  return {
    contract: MASTER_VERSION,
    chunks,
    all_chunks_ready: chunks.every((chunk) => chunk.ready),
    master_status: master.status || "NOT_RENDERED",
    master_storage_path: master.storage_path || null,
    master_signed_url: masterUrl,
    duration_seconds: MASTER_DURATION,
    narration_start_seconds: NARRATION_START,
    narration_duration_seconds: NARRATION_DURATION,
    sound_required: true,
    full_screen_ui_ratio: 0,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = String(url.searchParams.get("action") || "status").toLowerCase();

    if (action === "status") {
      return json({ success: true, ...(await status()) });
    }

    if (action === "render-chunk") {
      const index = Number(url.searchParams.get("index"));
      if (!Number.isInteger(index) || index < 1 || index > CHUNKS.length) {
        return json({ success: false, error: "Valid chunk index required" }, 400);
      }
      return json({ success: true, ...(await renderChunk(index)) });
    }

    if (action === "assemble") {
      return json({ success: true, ...(await assembleMaster()) });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CREATIVE_INVESTOR_SPATIAL_MASTER_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });
    return json({
      success: false,
      error: error?.message || String(error),
      details: error?.details || null,
    }, 500);
  }
}
