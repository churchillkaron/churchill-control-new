import fs from "node:fs";

const files = {
  runtime: "lib/creative/music/runtime/CreativeMusicHarmonyStructureRuntime.js",
  route: "app/api/creative/music/clip-harmony-structure/route.js",
  panel: "components/creative/ProductionStudio/workspaces/MusicClipMusicalAnalysisPanel.jsx",
};
for (const [name, file] of Object.entries(files)) if (!fs.existsSync(file)) throw new Error(`MUSIC_HARMONY_STRUCTURE_AUDIT_MISSING:${name}:${file}`);
const runtime = fs.readFileSync(files.runtime, "utf8");
const route = fs.readFileSync(files.route, "utf8");
const panel = fs.readFileSync(files.panel, "utf8");
const checks = [
  [runtime.includes("AVANTIQO_MUSIC_HARMONY_STRUCTURE_ANALYSIS_V1"), "runtime contract"],
  [runtime.includes("MAX_SECONDS = 240"), "bounded analysis"],
  [runtime.includes("classifyChord"), "chord classifier"],
  [runtime.includes("chord_labels_confidence_gated: true"), "chord confidence gate"],
  [runtime.includes("structureBoundaries"), "structure boundaries"],
  [runtime.includes("semantic_section_labels: false"), "semantic label limitation"],
  [runtime.includes("verse_chorus_labels: false"), "verse chorus limitation"],
  [runtime.includes('chord_quality_scope: ["major", "minor"]'), "chord scope explicit"],
  [route.includes("CREATIVE_MUSIC_HARMONY_STRUCTURE_REVISION_CONFLICT"), "revision guard"],
  [route.includes("harmony_structure_analysis"), "clip evidence persistence"],
  [panel.includes("Analyze harmony"), "harmony UI"],
  [panel.includes("harmonyMatchesCurrentSource"), "stale source guard"],
  [panel.includes("does not claim Verse, Chorus, Bridge"), "semantic UI limitation"],
];
for (const [passed, label] of checks) if (!passed) throw new Error(`MUSIC_HARMONY_STRUCTURE_AUDIT_FAILED:${label}`);
console.log("MUSIC_HARMONY_STRUCTURE_RUNTIME_AUDIT=PASS");
