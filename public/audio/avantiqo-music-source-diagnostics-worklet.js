function amplitudeToDb(value) {
  if (!Number.isFinite(value) || value <= 0) return -Infinity;
  return 20 * Math.log10(value);
}

function goertzelPower(samples, frequency) {
  if (!samples.length || !Number.isFinite(frequency) || frequency <= 0 || frequency >= sampleRate / 2) return 0;
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let index = 0; index < samples.length; index += 1) {
    s0 = samples[index] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2) / Math.max(1, samples.length * samples.length);
}

class AvantiqoSourceDiagnosticsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.floorHistory = [];
    this.publishFrames = Math.max(2048, Math.round(sampleRate * 0.5));
  }

  process(inputs, outputs) {
    const input = inputs?.[0];
    const output = outputs?.[0];
    if (!input?.length || !output?.length) return true;
    const frames = input[0]?.length || 0;
    for (let frame = 0; frame < frames; frame += 1) {
      let mono = 0;
      for (let channel = 0; channel < input.length; channel += 1) mono += input[channel]?.[frame] || 0;
      mono /= Math.max(1, input.length);
      this.buffer.push(mono);
      for (let channel = 0; channel < output.length; channel += 1) {
        output[channel][frame] = input[channel]?.[frame] ?? input[0]?.[frame] ?? 0;
      }
    }

    if (this.buffer.length >= this.publishFrames) {
      const samples = this.buffer.splice(0, this.publishFrames);
      let sum = 0;
      let sumSquares = 0;
      let peak = 0;
      for (const sample of samples) {
        sum += sample;
        sumSquares += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      const mean = sum / Math.max(1, samples.length);
      const rms = Math.sqrt(sumSquares / Math.max(1, samples.length));
      const rmsDb = amplitudeToDb(rms);
      if (Number.isFinite(rmsDb)) {
        this.floorHistory.push(rmsDb);
        if (this.floorHistory.length > 120) this.floorHistory.shift();
      }
      const sorted = [...this.floorHistory].sort((a, b) => a - b);
      const floorIndex = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * 0.15)));
      const backgroundFloor = sorted.length ? sorted[floorIndex] : -Infinity;
      const totalPower = Math.max(1e-12, sumSquares / Math.max(1, samples.length));
      const hum50 = goertzelPower(samples, 50) + goertzelPower(samples, 100) + goertzelPower(samples, 150);
      const hum60 = goertzelPower(samples, 60) + goertzelPower(samples, 120) + goertzelPower(samples, 180);
      const hum50Relative = 10 * Math.log10(Math.max(1e-12, hum50 / totalPower));
      const hum60Relative = 10 * Math.log10(Math.max(1e-12, hum60 / totalPower));
      const dominantHumHz = hum50 > hum60 ? 50 : 60;
      const dominantHumRelative = Math.max(hum50Relative, hum60Relative);
      this.port.postMessage({
        type: "source_diagnostics",
        rms_dbfs: rmsDb,
        peak_dbfs: amplitudeToDb(peak),
        dc_offset: mean,
        dc_offset_dbfs: amplitudeToDb(Math.abs(mean)),
        background_floor_estimate_dbfs: backgroundFloor,
        hum_50_relative_db: hum50Relative,
        hum_60_relative_db: hum60Relative,
        dominant_hum_hz: dominantHumHz,
        dominant_hum_relative_db: dominantHumRelative,
        hum_warning: dominantHumRelative > -28,
        dc_offset_warning: Math.abs(mean) > 0.01,
        floor_history_windows: this.floorHistory.length,
        floor_is_estimate: true,
      });
    }
    return true;
  }
}

registerProcessor("avantiqo-music-source-diagnostics", AvantiqoSourceDiagnosticsProcessor);
