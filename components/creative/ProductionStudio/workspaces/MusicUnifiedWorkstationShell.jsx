"use client";

import MusicMultitrackStudioPanelV2 from "./MusicMultitrackStudioPanelV2";
import MusicUnifiedTimelinePanel from "./MusicUnifiedTimelinePanel";

export default function MusicUnifiedWorkstationShell({ organizationId, projectId, projectName = "Music Project" }) {
  return (
    <div className="min-h-full bg-[#070707]">
      <MusicUnifiedTimelinePanel organizationId={organizationId} projectId={projectId} />
      <div className="border-b border-white/7 bg-black/25 px-4 py-2 text-[7px] uppercase tracking-[0.18em] text-white/18">
        Detailed audio editor · recording · clip editing · mixer · correction · release
      </div>
      <MusicMultitrackStudioPanelV2
        organizationId={organizationId}
        projectId={projectId}
        projectName={projectName}
      />
    </div>
  );
}
