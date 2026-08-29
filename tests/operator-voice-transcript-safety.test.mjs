import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectOperatorVoiceTranscript,
} from "../lib/operator/voice/OperatorVoiceTranscriptSafety.js";

test("accepts ordinary human Voice commands", () => {
  const result = inspectOperatorVoiceTranscript(
    "Open Finance and show me the latest invoices",
    { mode: "command" },
  );
  assert.equal(result.safe, true);
  assert.equal(result.transcript, "Open Finance and show me the latest invoices");
  assert.equal(result.reason, null);
});

test("rejects the command recognition prompt if STT echoes it", () => {
  const result = inspectOperatorVoiceTranscript(
    "This is a spoken command to the Avantiqo business operating system. Registered Avantiqo destinations: Home, Finance, People.",
    { mode: "command" },
  );
  assert.equal(result.safe, false);
  assert.equal(result.transcript, "");
  assert.equal(result.reason, "AVANTIQO_VOICE_INTERNAL_PROMPT_ECHO_REJECTED");
});

test("rejects the wake recognition prompt if STT echoes it", () => {
  const result = inspectOperatorVoiceTranscript(
    "This is wake-word detection for the assistant Avantiqo. Avantiqo is spelled A-v-a-n-t-i-q-o.",
    { mode: "wake" },
  );
  assert.equal(result.safe, false);
  assert.equal(result.transcript, "");
  assert.equal(result.reason, "AVANTIQO_VOICE_INTERNAL_PROMPT_ECHO_REJECTED");
});

test("allows empty wake windows without manufacturing speech", () => {
  const result = inspectOperatorVoiceTranscript("", { mode: "wake" });
  assert.equal(result.safe, true);
  assert.equal(result.transcript, "");
});

test("rejects implausibly long command transcripts", () => {
  const result = inspectOperatorVoiceTranscript(
    Array.from({ length: 181 }, () => "word").join(" "),
    { mode: "command" },
  );
  assert.equal(result.safe, false);
  assert.equal(result.reason, "AVANTIQO_VOICE_TRANSCRIPT_IMPLAUSIBLY_LONG");
});
