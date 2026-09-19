"use client";

import { Boxes, CheckCircle2, CircleDot, Layers3, ShieldCheck } from "lucide-react";

const CAPABILITIES = Object.freeze([
  ["Deep EXR", "NATIVE_DEEP_EXR_COMPOSITING", "Deepen · merge · holdout · preview flatten"],
  ["Render farm", "DISTRIBUTED_RENDER_FARM", "Remote chunk workers · checksum · resume"],
  ["Matchmove", "PROFESSIONAL_MATCHMOVE", "Focal solve · lens · scale · origin · rolling shutter"],
  ["Roto / matte", "PROFESSIONAL_ROTO", "Layered roto · splines · trimap · hair · blur"],
  ["Composite graph", "PROFESSIONAL_COMPOSITING_GRAPH", "Scene-linear DAG · AOV · Deep · STMap"],
  ["OTIO / AAF", "OTIO_AAF_EDITORIAL", "Picture-lock editorial interchange"],
  ["Lens STMap", "LENS_STMAP_CALIBRATION", "Undistort / re-distort float EXR maps"],
  ["VFX versions", "VFX_VERSION_PUBLISH_CACHE", "Publish · supersede · dependency cache"],
  ["HDR / IMF / DCP", "ADVANCED_DELIVERY", "HDR mezzanine · governed package validation"],
]);
function state(project, id) {
  const evidence = project?.metadata?.video_vfx_capability_evidence?.[id] || null;
  if (evidence?.certified === true) return { label: "Certified", tone: "text-emerald-800", Icon: CheckCircle2 };
  if (evidence?.implemented === true) return { label: "Implemented", tone: "text-[#8A633C]", Icon: ShieldCheck };
  return { label: "Runtime", tone: "text-[#716B63]", Icon: CircleDot };
}

export default function VideoVfxPipelinePanel({ project }) {
  return (
    <section className="border-b border-black/[0.07] bg-[#F1ECE5] px-4 py-3 lg:px-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Layers3 size={11} className="text-[#8A633C]" />
          <div>
            <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">
              Professional VFX pipeline
            </div>
            <div className="text-[8px] text-[#716B63]">
              Canonical Video Studio finishing infrastructure. Audio remains owned by Audio Studio.
            </div>
          </div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-white/70 px-2.5 py-1 text-[6.5px] font-semibold text-[#665F57]">
          <Boxes size={7} /> {CAPABILITIES.length} systems
        </div>
      </div>
      <div className="mt-3 grid gap-1.5 md:grid-cols-3">
        {CAPABILITIES.map(([label, id, detail]) => {
          const current = state(project, id);
          const Icon = current.Icon;
          return (
            <div key={id} className="rounded-lg border border-black/[0.07] bg-white/70 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[7px] font-semibold text-[#403C37]">{label}</span>
                <span className={"inline-flex items-center gap-1 text-[6px] font-semibold " + current.tone}>
                  <Icon size={6.5} /> {current.label}
                </span>
              </div>
              <div className="mt-1 text-[6px] leading-3 text-[#918B83]">{detail}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
