const PROCESSOR_NAME = "avantiqo-realtime-pcm-capture";
const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320;

class AvantiqoRealtimePcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_SAMPLE_RATE;
    this.pending = new Float32Array(0);
    this.nextSourceOffset = 0;
    this.pcm = new Int16Array(FRAME_SAMPLES * 2);
    this.pcmLength = 0;
    this.captureEnabled = true;

    this.port.onmessage = (event) => {
      const type = String(event?.data?.type || "").trim();
      if (type !== "stop") return;
      this.captureEnabled = false;
      this.flushPcm();
      this.port.postMessage({
        type: "audio.flushed",
        requestId: String(event?.data?.requestId || ""),
      });
    };
  }

  appendPcm(sample) {
    if (this.pcmLength >= this.pcm.length) {
      const expanded = new Int16Array(this.pcm.length * 2);
      expanded.set(this.pcm.subarray(0, this.pcmLength));
      this.pcm = expanded;
    }

    const clamped = Math.max(-1, Math.min(1, sample));
    this.pcm[this.pcmLength] = clamped < 0
      ? Math.round(clamped * 0x8000)
      : Math.round(clamped * 0x7fff);
    this.pcmLength += 1;

    while (this.pcmLength >= FRAME_SAMPLES) {
      this.emitPcm(FRAME_SAMPLES);
    }
  }

  emitPcm(length) {
    if (length <= 0 || length > this.pcmLength) return;
    const frame = this.pcm.slice(0, length);
    this.pcm.copyWithin(0, length, this.pcmLength);
    this.pcmLength -= length;
    this.port.postMessage({
      type: "audio.pcm16",
      sampleRate: TARGET_SAMPLE_RATE,
      pcm: frame.buffer,
    }, [frame.buffer]);
  }

  flushPcm() {
    if (this.pcmLength > 0) {
      this.emitPcm(this.pcmLength);
    }
  }

  resample(input) {
    if (!input?.length || !Number.isFinite(this.ratio) || this.ratio <= 0) return;

    const merged = new Float32Array(this.pending.length + input.length);
    merged.set(this.pending, 0);
    merged.set(input, this.pending.length);

    while (this.nextSourceOffset < merged.length - 1) {
      const left = Math.floor(this.nextSourceOffset);
      const right = Math.min(merged.length - 1, left + 1);
      const fraction = this.nextSourceOffset - left;
      const sample = merged[left] + ((merged[right] - merged[left]) * fraction);
      this.appendPcm(sample);
      this.nextSourceOffset += this.ratio;
    }

    const consumed = Math.min(merged.length, Math.max(0, Math.floor(this.nextSourceOffset)));
    this.pending = merged.slice(consumed);
    this.nextSourceOffset -= consumed;
  }

  process(inputs) {
    if (!this.captureEnabled) return true;
    const channel = inputs?.[0]?.[0];
    if (channel?.length) this.resample(channel);
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, AvantiqoRealtimePcmCaptureProcessor);
