import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspace = await readFile("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");
const timeline = await readFile("components/creative/ProductionStudio/workspaces/TimelineWorkspace.jsx", "utf8");

test("Music Studio exposes Audio for Video through the canonical shared timeline", () => {
  assert.match(workspace, /id: "audio-video", label: "Audio for Video"/);
  assert.match(workspace, /TimelineWorkspace runtime=\{runtime\} editor=\{editor\}/);
  assert.match(workspace, /Score picture and place sound against exact timecode/);
  assert.match(timeline, /TrackLane label="Video"/);
  assert.match(timeline, /TrackLane label="Dialogue"/);
  assert.match(timeline, /TrackLane label="Music \/ SFX"/);
  assert.match(timeline, /TrackLane label="Captions"/);
});
