function amplitudeToDb(value) {
  if (!Number.isFinite(value) || value <= 0) return -Infinity;
  return 20 * Math.log10(value);
}

class AvantiqoStereoMeterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sumLR = 0;
    this.sumL2 = 0;
    this.sumR2 = 0;
    this.peakL = 0;
    this.peakR = 0;
    this.frames = 0;
    this.publishFrames = Math.max(128, Math.round(sampleRate / 20));
  }

  reset() {
    this.sumLR = 0;
    this.sumL2 = 0;
    this.sumR2 = 0;
    this.peakL = 0;
    this.peakR = 0;
    this.frames = 0;
  }

  process(inputs, outputs) {
    const input = inputs?.[0];
    const output = outputs?.[0];
    if (!input?.length || !output?.length) return true;
    const left = input[0] || [];
    const right = input[1] || left;
    const frames = left.length;

    for (let frame = 0; frame < frames; frame += 1) {
      const l = left[frame] || 0;
      const r = right[frame] ?? l;
      this.sumLR += l * r;
      this.sumL2 += l * l;
      this.sumR2 += r * r;
      this.peakL = Math.max(this.peakL, Math.abs(l));
      this.peakR = Math.max(this.peakR, Math.abs(r));
      for (let channel = 0; channel < output.length; channel += 1) {
        output[channel][frame] = input[channel]?.[frame] ?? l;
      }
    }

    this.frames += frames;
    if (this.frames >= this.publishFrames) {
      const denominator = Math.sqrt(this.sumL2 * this.sumR2);
      const correlation = denominator > 1e-12
        ? Math.max(-1, Math.min(1, this.sumLR / denominator))
        : 1;
      const rmsL = Math.sqrt(this.sumL2 / Math.max(1, this.frames));
      const rmsR = Math.sqrt(this.sumR2 / Math.max(1, this.frames));
      const leftDb = amplitudeToDb(rmsL);
      const rightDb = amplitudeToDb(rmsR);
      this.port.postMessage({
        type: "stereo_meter",
        correlation,
        left_rms_dbfs: leftDb,
        right_rms_dbfs: rightDb,
        left_peak_dbfs: amplitudeToDb(this.peakL),
        right_peak_dbfs: amplitudeToDb(this.peakR),
        balance_db: Number.isFinite(leftDb) && Number.isFinite(rightDb) ? leftDb - rightDb : 0,
        mono_compatibility_warning: correlation < 0.15,
        phase_risk: correlation < 0,
      });
      this.reset();
    }
    return true;
  }
}

registerProcessor("avantiqo-music-stereo-meter", AvantiqoStereoMeterProcessor);
