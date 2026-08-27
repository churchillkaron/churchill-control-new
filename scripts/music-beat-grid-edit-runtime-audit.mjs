import fs from "node:fs";

const editorPath = "components/creative/ProductionStudio/workspaces/MusicClipEditorPanel.jsx";
const workstationPath = "components/creative/ProductionStudio/workspaces/MusicMultitrackStudioPanelV2.jsx";
const overdubPath = "components/creative/ProductionStudio/workspaces/MusicWorkstationOverdubPanel.jsx";
for (const file of [editorPath, workstationPath, overdubPath]) if (!fs.existsSync(file)) throw new Error(`MUSIC_BEAT_GRID_AUDIT_MISSING:${file}`);
const editor = fs.readFileSync(editorPath, "utf8");
const workstation = fs.readFileSync(workstationPath, "utf8");
const overdub = fs.readFileSync(overdubPath, "utf8");
const checks = [
  [editor.includes("function snappedSeconds"), "snap function"],
  [editor.includes('toLowerCase() !== "beat"'), "free mode retained"],
  [editor.includes("60 / Math.max(30"), "BPM beat duration"],
  [editor.includes("trimMusicClipStart(clip, editPlayhead)"), "trim left grid"],
  [editor.includes("trimMusicClipEnd(clip, editPlayhead)"), "trim right grid"],
  [editor.includes("splitMusicClip(clip, editPlayhead)"), "split grid"],
  [editor.includes("moveMusicClip(clip, snappedSeconds"), "move grid"],
  [editor.includes("never time-stretches the source"), "non-stretch snap semantics"],
  [workstation.includes("bpm={session.bpm || 96}"), "session BPM binding"],
  [workstation.includes('snap={session.timeline?.snap || "beat"}'), "session snap binding"],
  [overdub.includes("await playCountIn({ bpm, bars: countInBars, signature })"), "count-in BPM binding"],
];
for (const [passed, label] of checks) if (!passed) throw new Error(`MUSIC_BEAT_GRID_AUDIT_FAILED:${label}`);
console.log("MUSIC_BEAT_GRID_EDIT_RUNTIME_AUDIT=PASS");
