import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), ".github", "workflows");
const paidMarkers = [
  { label: "Modal credentials", re: /secrets\.(?:MODAL_TOKEN|AVANTIQO_MODAL_TOKEN)/i },
  { label: "Modal execution", re: /(?:^|\s)(?:python\s+-m\s+modal|modal)\s+(?:run|deploy|serve)\b/im },
  { label: "RunPod credentials", re: /secrets\.[A-Z0-9_]*RUNPOD[A-Z0-9_]*/i },
  { label: "RunPod API", re: /api\.runpod\.io|runpod\.io\/graphql/i },
  { label: "FAL credentials", re: /secrets\.[A-Z0-9_]*FAL[A-Z0-9_]*/i },
  { label: "FAL API", re: /(?:queue\.)?fal\.run/i },
  { label: "OpenAI credentials", re: /secrets\.[A-Z0-9_]*OPENAI[A-Z0-9_]*/i },
  { label: "Anthropic credentials", re: /secrets\.[A-Z0-9_]*ANTHROPIC[A-Z0-9_]*/i },
  { label: "Gemini credentials", re: /secrets\.[A-Z0-9_]*(?:GEMINI|GOOGLE_AI)[A-Z0-9_]*/i },
  { label: "Replicate credentials", re: /secrets\.[A-Z0-9_]*REPLICATE[A-Z0-9_]*/i },
  { label: "ElevenLabs credentials", re: /secrets\.[A-Z0-9_]*ELEVENLABS[A-Z0-9_]*/i },
  { label: "Suno credentials", re: /secrets\.[A-Z0-9_]*SUNO[A-Z0-9_]*/i },
  { label: "Heavy container build", re: /docker\/build-push-action@|docker\s+buildx?\s+build[^\n]*--push/i },
];

function automaticTrigger(source) {
  const onMatch = source.match(/^on:\s*\n((?:[ \t].*\n|\n)*)/m);
  if (!onMatch) return [];
  const block = onMatch[0];
  const triggers = [];
  if (/^\s{2}push\s*:/m.test(block)) triggers.push("push");
  if (/^\s{2}schedule\s*:/m.test(block)) triggers.push("schedule");
  if (/^\s{2}pull_request\s*:/m.test(block)) triggers.push("pull_request");
  return triggers;
}

const failures = [];
for (const name of fs.readdirSync(root).filter((value) => /\.ya?ml$/i.test(value)).sort()) {
  const file = path.join(root, name);
  const source = fs.readFileSync(file, "utf8");
  const triggers = automaticTrigger(source);
  if (!triggers.length) continue;

  for (const marker of paidMarkers) {
    if (!marker.re.test(source)) continue;
    failures.push({
      workflow: name,
      triggers,
      reason: marker.label,
    });
  }
}

if (failures.length) {
  console.error("AUTOMATIC_PAID_WORKFLOW_GUARD=FAIL");
  for (const failure of failures) {
    console.error(
      `${failure.workflow}: automatic=${failure.triggers.join(",")} paid_marker=${failure.reason}`,
    );
  }
  process.exit(1);
}

console.log("AUTOMATIC_PAID_WORKFLOW_GUARD=PASS");
console.log("Paid provider/GPU/container workflows require explicit manual dispatch.");
