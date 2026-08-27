class AvantiqoPcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channelChunks = [];
    this.pendingFrames = 0;
    this.flushFrames = 4096;
    this.port.onmessage = (event) => {
      if (event?.data?.type === "flush") this.flush();
    };
  }

  ensureChannels(count) {
    while (this.channelChunks.length < count) this.channelChunks.push([]);
  }

  flush() {
    if (!this.pendingFrames || !this.channelChunks.length) {
      this.port.postMessage({ type: "flushed", channels: [], frames: 0 });
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
    this.port.postMessage(
      { type: "pcm", channels: output, frames },
      output.map((channel) => channel.buffer),
    );
    this.port.postMessage({ type: "flushed", channels: output.length, frames });
  }

  process(inputs) {
    const input = inputs?.[0];
    if (!input?.length || !input[0]?.length) return true;
    this.ensureChannels(input.length);
    for (let channel = 0; channel < input.length; channel += 1) {
      this.channelChunks[channel].push(Float32Array.from(input[channel]));
    }
    this.pendingFrames += input[0].length;
    if (this.pendingFrames >= this.flushFrames) this.flush();
    return true;
  }
}

registerProcessor("avantiqo-pcm-recorder", AvantiqoPcmRecorderProcessor);
