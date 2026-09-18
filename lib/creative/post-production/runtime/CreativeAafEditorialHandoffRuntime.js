import crypto from "node:crypto";

import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";
import { CreativeToolSnapshotRuntime } from "@/lib/creative/tools/runtime/CreativeToolSnapshotRuntime";

export const AVANTIQO_AAF_EDITORIAL_HANDOFF_CONTRACT =
  "AVANTIQO_AAF_EDITORIAL_HANDOFF_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function pythonScript(config64) {
  return [
    "import base64,json,aaf2",
    "cfg=json.loads(base64.b64decode('" + config64 + "').decode())",
    "with aaf2.open(cfg['output_path'],'w') as f:",
    "    comp=f.create.CompositionMob()",
    "    comp.name=cfg['name']",
    "    f.content.mobs.append(comp)",
    "    slot=comp.create_timeline_slot(edit_rate=cfg['rate'])",
    "    seq=f.create.Sequence(media_kind='picture')",
    "    slot.segment=seq",
    "    for item in cfg['entries']:",
    "        length=max(1,int(item['duration_frames']))",
    "        clip=f.create.SourceClip(media_kind='picture',length=length)",
    "        clip.start=int(item['source_start_frames'])",
    "        seq.components.append(clip)",
    "print(json.dumps({'events':len(cfg['entries']),'rate':cfg['rate']}))",
  ].join("\n");
}

export async function renderAafEditorialHandoff({
  project, timeline, frame_rate = 24, name = "Avantiqo Picture Lock",
} = {}) {
  if (!project?.id) throw new Error("AAF_PROJECT_REQUIRED");
  const metadata = timeline?.metadata || timeline || {};
  const entries = list(metadata.edit_decision_list);
  if (!entries.length) throw new Error("AAF_EDIT_DECISIONS_REQUIRED");
  if (metadata.human_picture_lock_required === true &&
      metadata.picture_lock_approved !== true && timeline?.review?.approved !== true) {
    throw new Error("AAF_PICTURE_LOCK_APPROVAL_REQUIRED");
  }
  const rate = finite(frame_rate, 24);
  const normalized = entries.map((entry) => ({
    asset_node_id: text(entry.source_asset_node_id),
    source_url: text(entry.source_url),
    source_start_frames: Math.max(0, Math.round(finite(entry.source_in_seconds) * rate)),
    duration_frames: Math.max(1, Math.round(
      finite(entry.duration_seconds,
        finite(entry.source_out_seconds) - finite(entry.source_in_seconds)) * rate,
    )),
  }));
  const ensured = await CreativeToolSnapshotRuntime.ensure({ project, tool_id: "aaf" });
  const identity = hash(JSON.stringify({ rate, normalized })).slice(0, 20);
  const base = "/tmp/avantiqo-aaf-" + identity;
  const scriptPath = base + "/export.py";
  const outputPath = base + "/picture-lock.aaf";
  const sandbox = await CreativeSandboxRuntime.fromSnapshot({
    snapshot_id: ensured.snapshot_id,
    timeout_ms: 300000,
    network_policy: "deny-all",
  });
  try {
    const config64 = Buffer.from(JSON.stringify({
      output_path: outputPath,
      name: text(name) || "Avantiqo Picture Lock",
      rate,
      entries: normalized,
    })).toString("base64");
    await CreativeSandboxRuntime.writeText({
      sandbox, path: scriptPath, content: pythonScript(config64),
    });
    await CreativeSandboxRuntime.run({
      sandbox, cmd: "/tmp/avantiqo-aaf/venv/bin/python", args: [scriptPath],
      error_prefix: "AAF_EXPORT_FAILED",
    });
    const buffer = await CreativeSandboxRuntime.readBuffer({ sandbox, path: outputPath });
    if (buffer.length < 1024) throw new Error("AAF_EXPORT_OUTPUT_TOO_SMALL");
    return {
      contract: AVANTIQO_AAF_EDITORIAL_HANDOFF_CONTRACT,
      status: "READY",
      buffer,
      bytes: buffer.length,
      checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
      mime_type: "application/octet-stream",
      extension: "aaf",
      event_count: normalized.length,
      frame_rate: rate,
      picture_lock_enforced: true,
      provider_calls_performed: false,
    };
  } finally {
    await CreativeSandboxRuntime.stop(sandbox);
  }
}

export const CreativeAafEditorialHandoffRuntime = Object.freeze({
  contract: AVANTIQO_AAF_EDITORIAL_HANDOFF_CONTRACT,
  render: renderAafEditorialHandoff,
});
