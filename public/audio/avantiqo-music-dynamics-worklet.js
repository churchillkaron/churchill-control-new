function dbToGain(db) {
  return 10 ** (Number(db || 0) / 20);
}

function coefficient(milliseconds) {
  const seconds = Math.max(0.0001, Number(milliseconds || 1) / 1000);
  return Math.exp(-1 / (seconds * sampleRate));
}

class AvantiqoGateProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options?.processorOptions || {};
    this.threshold = dbToGain(config.threshold_db ?? -48);
    this.rangeGain = dbToGain(config.range_db ?? -60);
    this.attack = coefficient(config.attack_ms ?? 2);
    this.release = coefficient(config.release_ms ?? 140);
    this.holdFrames = Math.max(0, Math.round((Number(config.hold_ms ?? 35) / 1000) * sampleRate));
    this.holdRemaining = 0;
    this.gain = 1;
  }

  process(inputs, outputs) {
    const input = inputs?.[0];
    const output = outputs?.[0];
    if (!input?.length || !output?.length) return true;
    const frames = input[0]?.length || 0;
    for (let frame = 0; frame < frames; frame += 1) {
      let level = 0;
      for (let channel = 0; channel < input.length; channel += 1) {
        level = Math.max(level, Math.abs(input[channel]?.[frame] || 0));
      }
      let target = this.rangeGain;
      if (level >= this.threshold) {
        this.holdRemaining = this.holdFrames;
        target = 1;
      } else if (this.holdRemaining > 0) {
        this.holdRemaining -= 1;
        target = 1;
      }
      const coeff = target > this.gain ? this.attack : this.release;
      this.gain = target + coeff * (this.gain - target);
      for (let channel = 0; channel < output.length; channel += 1) {
        output[channel][frame] = (input[channel]?.[frame] || input[0]?.[frame] || 0) * this.gain;
      }
    }
    return true;
  }
}

class AvantiqoDeEsserProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options?.processorOptions || {};
    this.frequency = Math.max(2500, Math.min(12000, Number(config.frequency_hz ?? 6500)));
    this.thresholdDb = Number(config.threshold_db ?? -26);
    this.threshold = dbToGain(this.thresholdDb);
    this.ratio = Math.max(1, Math.min(12, Number(config.ratio ?? 4)));
    this.maxReductionDb = Math.max(0, Math.min(18, Number(config.max_reduction_db ?? 8)));
    this.attack = coefficient(config.attack_ms ?? 1.5);
    this.release = coefficient(config.release_ms ?? 85);
    this.gain = 1;
    this.previousInput = [];
    this.previousHighpass = [];
    const rc = 1 / (2 * Math.PI * this.frequency);
    const dt = 1 / sampleRate;
    this.highpassAlpha = rc / (rc + dt);
  }

  process(inputs, outputs) {
    const input = inputs?.[0];
    const output = outputs?.[0];
    if (!input?.length || !output?.length) return true;
    const frames = input[0]?.length || 0;
    while (this.previousInput.length < input.length) {
      this.previousInput.push(0);
      this.previousHighpass.push(0);
    }

    for (let frame = 0; frame < frames; frame += 1) {
      let sidechain = 0;
      for (let channel = 0; channel < input.length; channel += 1) {
        const sample = input[channel]?.[frame] || 0;
        const highpass = this.highpassAlpha * (
          this.previousHighpass[channel] + sample - this.previousInput[channel]
        );
        this.previousInput[channel] = sample;
        this.previousHighpass[channel] = highpass;
        sidechain = Math.max(sidechain, Math.abs(highpass));
      }

      let target = 1;
      if (sidechain > this.threshold) {
        const overDb = 20 * Math.log10(Math.max(1, sidechain / this.threshold));
        const reductionDb = Math.min(this.maxReductionDb, overDb * (1 - 1 / this.ratio));
        target = dbToGain(-reductionDb);
      }
      const coeff = target < this.gain ? this.attack : this.release;
      this.gain = target + coeff * (this.gain - target);
      for (let channel = 0; channel < output.length; channel += 1) {
        output[channel][frame] = (input[channel]?.[frame] || input[0]?.[frame] || 0) * this.gain;
      }
    }
    return true;
  }
}

registerProcessor("avantiqo-music-gate", AvantiqoGateProcessor);
registerProcessor("avantiqo-music-deesser", AvantiqoDeEsserProcessor);
