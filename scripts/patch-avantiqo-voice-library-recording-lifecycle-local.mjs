import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CONTRACT = "AVANTIQO_VOICE_LIBRARY_RECORDING_LIFECYCLE_PATCH_V1";
const ROOT = process.cwd();
const TARGET = path.join(ROOT, "components/operator/AvantiqoVoiceLibraryPanel.jsx");

function fail(code, details = {}) {
  console.error(JSON.stringify({ success: false, contract: CONTRACT, error: code, ...details }, null, 2));
  process.exit(1);
}

function replaceExactly(source, before, after, code) {
  const first = source.indexOf(before);
  if (first === -1) fail(code, { reason: "SOURCE_MARKER_MISSING" });
  if (source.indexOf(before, first + before.length) !== -1) {
    fail(code, { reason: "SOURCE_MARKER_NOT_UNIQUE" });
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

if (!fs.existsSync(TARGET)) fail("AVANTIQO_VOICE_LIBRARY_PANEL_MISSING");
let source = fs.readFileSync(TARGET, "utf8");

const alreadyFixed =
  source.includes("const recordingUrlRef = useRef(\"\");") &&
  source.includes("function releaseRecordingUrl()") &&
  source.includes("function stopRecorderForCleanup()") &&
  source.includes("recordingUrlRef.current = url;");

if (!alreadyFixed) {
  source = replaceExactly(
    source,
    "  const previewAudioRef = useRef(null);\n",
    "  const previewAudioRef = useRef(null);\n  const recordingUrlRef = useRef(\"\");\n",
    "AVANTIQO_VOICE_LIBRARY_RECORDING_URL_REF_MARKER_CHANGED",
  );

  source = replaceExactly(
    source,
    `    return () => {\n      if (hardStopRef.current) window.clearTimeout(hardStopRef.current);\n      for (const track of streamRef.current?.getTracks?.() || []) track.stop();\n      previewAudioRef.current?.pause?.();\n      if (recordingUrl) URL.revokeObjectURL(recordingUrl);\n    };\n`,
    `    return () => {\n      if (hardStopRef.current) {\n        window.clearTimeout(hardStopRef.current);\n        hardStopRef.current = null;\n      }\n      stopRecorderForCleanup();\n      releaseRecordingStream();\n      releaseRecordingUrl();\n      const previewAudio = previewAudioRef.current;\n      previewAudioRef.current = null;\n      if (previewAudio) {\n        previewAudio.onended = null;\n        previewAudio.onerror = null;\n        previewAudio.pause?.();\n        previewAudio.src = \"\";\n      }\n    };\n`,
    "AVANTIQO_VOICE_LIBRARY_UNMOUNT_CLEANUP_MARKER_CHANGED",
  );

  source = replaceExactly(
    source,
    `  function releaseRecordingStream() {\n    for (const track of streamRef.current?.getTracks?.() || []) track.stop();\n    streamRef.current = null;\n  }\n\n  function clearRecording() {\n    if (recordingUrl) URL.revokeObjectURL(recordingUrl);\n    setRecordingBlob(null);\n    setRecordingUrl(\"\");\n    setRecordingSeconds(0);\n  }\n`,
    `  function releaseRecordingStream() {\n    for (const track of streamRef.current?.getTracks?.() || []) track.stop();\n    streamRef.current = null;\n  }\n\n  function releaseRecordingUrl() {\n    const url = recordingUrlRef.current;\n    recordingUrlRef.current = \"\";\n    if (url) URL.revokeObjectURL(url);\n  }\n\n  function stopRecorderForCleanup() {\n    const recorder = recorderRef.current;\n    recorderRef.current = null;\n    chunksRef.current = [];\n    if (!recorder || recorder.state === \"inactive\") return;\n    recorder.ondataavailable = null;\n    recorder.onerror = null;\n    recorder.onstop = null;\n    try {\n      recorder.stop();\n    } catch {\n      // Recorder may already be stopping while the panel unmounts.\n    }\n  }\n\n  function clearRecording() {\n    releaseRecordingUrl();\n    setRecordingBlob(null);\n    setRecordingUrl(\"\");\n    setRecordingSeconds(0);\n  }\n`,
    "AVANTIQO_VOICE_LIBRARY_RECORDING_RELEASE_MARKER_CHANGED",
  );

  source = replaceExactly(
    source,
    `      recorder.onerror = () => {\n        setRecording(false);\n        releaseRecordingStream();\n        setError(\"Voice recording failed\");\n      };\n`,
    `      recorder.onerror = () => {\n        recorderRef.current = null;\n        if (hardStopRef.current) {\n          window.clearTimeout(hardStopRef.current);\n          hardStopRef.current = null;\n        }\n        setRecording(false);\n        releaseRecordingStream();\n        setError(\"Voice recording failed\");\n      };\n`,
    "AVANTIQO_VOICE_LIBRARY_RECORDER_ERROR_MARKER_CHANGED",
  );

  source = replaceExactly(
    source,
    `        chunksRef.current = [];\n        setRecording(false);\n        releaseRecordingStream();\n`,
    `        chunksRef.current = [];\n        recorderRef.current = null;\n        setRecording(false);\n        releaseRecordingStream();\n`,
    "AVANTIQO_VOICE_LIBRARY_RECORDER_STOP_MARKER_CHANGED",
  );

  source = replaceExactly(
    source,
    `        const url = URL.createObjectURL(blob);\n        setRecordingBlob(blob);\n        setRecordingUrl(url);\n        setRecordingSeconds(durationSeconds);\n`,
    `        releaseRecordingUrl();\n        const url = URL.createObjectURL(blob);\n        recordingUrlRef.current = url;\n        setRecordingBlob(blob);\n        setRecordingUrl(url);\n        setRecordingSeconds(durationSeconds);\n`,
    "AVANTIQO_VOICE_LIBRARY_NEW_RECORDING_URL_MARKER_CHANGED",
  );

  fs.writeFileSync(TARGET, source, "utf8");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  file: TARGET,
  changed: !alreadyFixed,
  stale_recording_url_cleanup: true,
  recorder_cleanup_on_unmount: true,
  preview_cleanup_on_unmount: true,
  gpu_started: false,
  generation_submitted: false,
  production_deploy_performed: false,
}, null, 2));
