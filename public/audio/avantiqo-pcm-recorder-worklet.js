class AvantiqoPcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channelChunks = [];
    this.pendingFrames = 0;
    this.flushFrames = 4096;
    this.sequence = 0;
    this.totalFrames = 0;
    this.port.onmessage = (event) => {
      if (event?.data?.type === "flush") this.flush("manual");
    };
  }

  ensureChannels(count) {
    while (this.channelChunks.length < count) this.channelChunks.push([]);
  }

  flush(reason = "chunk") {
    if (!this.pendingFrames || !this.channelChunks.length) {
      if (reason === "manual") {
        this.port.postMessage({ type: "flushed", reason, channels: 0, frames: 0, sequence: this.sequence, total_frames: this.totalFrames });
      }
      return;
    }

    const output = this.channelChunks.map((chunks) => {
      const merged = new Float32Array(this.pendingFrames);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      return merged;
    });

    this.channelChunks = this.channelChunks.map(() => []);
    const frames = this.pendingFrames;
    this.pendingFrames = 0;
    const frameStart = this.totalFrames;
    const frameEnd = frameStart + frames;
    const sequence = this.sequence;
    this.sequence += 1;
    this.totalFrames = frameEnd;
    this.port.postMessage(
      { type: "pcm", channels: output, frames, sequence, frame_start: frameStart, frame_end: frameEnd },
      output.map((channel) => channel.buffer),
    );
    if (reason === "manual") {
      this.port.postMessage({ type: "flushed", reason, channels: output.length, frames, sequence: this.sequence, total_frames: this.totalFrames });
    }
  }

  process(inputs) {
    const input = inputs?.[0];
    if (!input?.length || !input[0]?.length) return true;
    this.ensureChannels(input.length);
    for (let channel = 0; channel < input.length; channel += 1) {
      this.channelChunks[channel].push(Float32Array.from(input[channel]));
    }
    this.pendingFrames += input[0].length;
    if (this.pendingFrames >= this.flushFrames) this.flush("chunk");
    return true;
  }
}

registerProcessor("avantiqo-pcm-recorder", AvantiqoPcmRecorderProcessor);
