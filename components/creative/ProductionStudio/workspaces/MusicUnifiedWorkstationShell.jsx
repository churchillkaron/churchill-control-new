"use client";

import MusicMultitrackStudioPanelV2 from "./MusicMultitrackStudioPanelV2";
import MusicUnifiedTimelinePanel from "./MusicUnifiedTimelinePanel";
import MusicMixEngineerPanel from "./MusicMixEngineerPanel";
import { useState } from "react";

export default function MusicUnifiedWorkstationShell({ organizationId, projectId, projectName = "Music Project", onProfessionalReleaseAdvanced }) {
  const [workstationRevision, setWorkstationRevision] = useState(0);
  return (
    <div className="min-h-full bg-[#070707]">
      <MusicMixEngineerPanel organizationId={organizationId} projectId={projectId} onApplied={() => setWorkstationRevision((value) => value + 1)} />
      <MusicUnifiedTimelinePanel key={`timeline-${workstationRevision}`} organizationId={organizationId} projectId={projectId} />
      <div className="border-b border-white/7 bg-black/25 px-4 py-2 text-[7px] uppercase tracking-[0.18em] text-white/18">
        Detailed audio editor · recording · clip editing · mixer · correction · release
      </div>
      <MusicMultitrackStudioPanelV2
        key={`workstation-${workstationRevision}`}
        organizationId={organizationId}
        projectId={projectId}
        projectName={projectName}
        onProfessionalReleaseAdvanced={onProfessionalReleaseAdvanced}
      />
    </div>
  );
}
