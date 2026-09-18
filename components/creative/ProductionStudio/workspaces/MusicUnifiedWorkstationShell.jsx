"use client";

import MusicMultitrackStudioPanelV2 from "./MusicMultitrackStudioPanelV2";
import MusicUnifiedTimelinePanel from "./MusicUnifiedTimelinePanel";
import MusicMixEngineerPanel from "./MusicMixEngineerPanel";
import MusicAudioPostReconformPanel from "./MusicAudioPostReconformPanel";
import MusicAudioPostMixPanel from "./MusicAudioPostMixPanel";
import MusicSoundDesignObjectPanel from "./MusicSoundDesignObjectPanel";
import MusicAdvancedSoundDesignPanel from "./MusicAdvancedSoundDesignPanel";
import MusicFoleyContactPanel from "./MusicFoleyContactPanel";
import { useState } from "react";

export default function MusicUnifiedWorkstationShell({ organizationId, projectId, projectName = "Audio Project", audioRoom = "MUSIC_PRODUCTION", onRoomChange = null, onProfessionalReleaseAdvanced }) {
  const [workstationRevision, setWorkstationRevision] = useState(0);
  const rooms = [
    ["MUSIC_PRODUCTION", "Music Production"], ["SOUND_DESIGN", "Sound Design"], ["AUDIO_POST", "Audio Post"], ["MASTERING_DELIVERY", "Mastering & Delivery"],
  ];
  return (
    <div className="min-h-full bg-[#070707]">
      <div className="border-b border-white/7 bg-[#0a0a0a] px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[8px] uppercase tracking-[0.18em] text-[#d6a66a]/60">Avantiqo Professional Audio Engine</div><div className="mt-1 text-[10px] text-white/32">One project · one session · shared picture lock, assets, mix state and delivery lineage</div></div><div className="flex flex-wrap gap-1">{rooms.map(([id,label])=><button key={id} type="button" onClick={()=>onRoomChange?.(id)} className={`rounded-lg border px-2.5 py-1.5 text-[8px] ${audioRoom===id ? "border-[#d6a66a]/30 bg-[#d6a66a]/10 text-[#efd29f]/75" : "border-white/7 text-white/30 hover:text-white/55"}`}>{label}</button>)}</div></div></div>
      {audioRoom === "SOUND_DESIGN" ? <><MusicSoundDesignObjectPanel organizationId={organizationId} projectId={projectId} onSaved={() => setWorkstationRevision((value) => value + 1)} /><MusicAdvancedSoundDesignPanel organizationId={organizationId} projectId={projectId} onSaved={() => setWorkstationRevision((value) => value + 1)} /><MusicFoleyContactPanel organizationId={organizationId} projectId={projectId} onApplied={() => setWorkstationRevision((value) => value + 1)} /></> : null}
      {audioRoom === "AUDIO_POST" ? <><MusicAudioPostReconformPanel organizationId={organizationId} projectId={projectId} onApplied={() => setWorkstationRevision((value) => value + 1)} /><MusicAudioPostMixPanel organizationId={organizationId} projectId={projectId} onApplied={() => setWorkstationRevision((value) => value + 1)} /></> : null}
      <MusicMixEngineerPanel organizationId={organizationId} projectId={projectId} onApplied={() => setWorkstationRevision((value) => value + 1)} />
      <MusicUnifiedTimelinePanel key={`timeline-${workstationRevision}`} organizationId={organizationId} projectId={projectId} />
      <div className="border-b border-white/7 bg-black/25 px-4 py-2 text-[7px] uppercase tracking-[0.18em] text-white/18">
        Shared professional audio session · recording · editorial · sound design · mix · post · mastering · delivery
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
