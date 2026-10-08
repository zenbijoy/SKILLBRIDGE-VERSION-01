import fs from "fs";
import path from "path";

function createWavBuffer(sampleRate, samples) {
  const byteRate = sampleRate * 2; // 16-bit mono = 2 bytes per sample
  const blockAlign = 2;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF chunk descriptor
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // "fmt " sub-chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // subchunk1 size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // audio format 1 = PCM
  buffer.writeUInt16LE(1, 22); // num channels (1 = mono)
  buffer.writeUInt32LE(sampleRate, 24); // sample rate
  buffer.writeUInt32LE(byteRate, 28); // byte rate
  buffer.writeUInt16LE(blockAlign, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample

  // "data" sub-chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write 16-bit PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    // Clamp to -1.0 to 1.0
    const s = Math.max(-1.0, Math.min(1.0, samples[i]));
    const intSample = s < 0 ? s * 32768 : s * 32767;
    buffer.writeInt16LE(Math.round(intSample), offset);
    offset += 2;
  }

  return buffer;
}

const sampleRate = 44100;

// 1. Generate realistic melodic ringtone (~3.6 seconds loop)
// Beautiful marimba/bell notes: E5 (659.25), G#5 (830.61), B5 (987.77), E6 (1318.51)
function generateRingtone() {
  const duration = 3.6;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);

  // Melodic notes sequence [startTime, duration, freq, volume]
  const notes = [
    // Phrase 1
    [0.0, 0.28, 659.25, 0.45],   // E5
    [0.24, 0.28, 830.61, 0.45],  // G#5
    [0.48, 0.28, 987.77, 0.50],  // B5
    [0.72, 0.55, 1318.51, 0.60], // E6
    [1.15, 0.35, 987.77, 0.45],  // B5
    [1.45, 0.55, 1174.66, 0.55], // D6
    // Pause
    // Phrase 2
    [1.95, 0.28, 659.25, 0.45],  // E5
    [2.19, 0.28, 830.61, 0.45],  // G#5
    [2.43, 0.28, 1174.66, 0.50], // D6
    [2.67, 0.65, 1318.51, 0.60], // E6
  ];

  for (const [startSec, durSec, freq, vol] of notes) {
    const startSample = Math.floor(startSec * sampleRate);
    const noteSamples = Math.floor(durSec * sampleRate);

    for (let i = 0; i < noteSamples; i++) {
      const idx = startSample + i;
      if (idx >= totalSamples) break;

      const t = i / sampleRate;
      // Exponential decay envelope like a marimba / bell chime
      const envelope = Math.exp(-4.2 * (t / durSec));
      // Fundamental + gentle second and third harmonic for rich realistic tone
      const osc =
        Math.sin(2 * Math.PI * freq * t) * 0.7 +
        Math.sin(2 * Math.PI * freq * 2 * t) * 0.2 +
        Math.sin(2 * Math.PI * freq * 3 * t) * 0.1;

      samples[idx] += osc * envelope * vol;
    }
  }

  return createWavBuffer(sampleRate, samples);
}

// 2. Generate standard realistic phone ringback tone (440Hz + 480Hz dual tone)
// Standard cadence: 1.6s ring, 2.0s silence = 3.6s total loop
function generateRingback() {
  const duration = 3.6;
  const ringDuration = 1.6;
  const totalSamples = Math.floor(sampleRate * duration);
  const ringSamples = Math.floor(sampleRate * ringDuration);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < ringSamples; i++) {
    const t = i / sampleRate;
    // Smooth 30ms attack and release to avoid clicks
    let attackRelease = 1.0;
    if (t < 0.03) attackRelease = t / 0.03;
    else if (t > ringDuration - 0.03) attackRelease = (ringDuration - t) / 0.03;

    const tone1 = Math.sin(2 * Math.PI * 440 * t);
    const tone2 = Math.sin(2 * Math.PI * 480 * t);
    samples[i] = (tone1 * 0.25 + tone2 * 0.25) * attackRelease;
  }

  return createWavBuffer(sampleRate, samples);
}

// 3. Generate call end / disconnect sound (3 soft descending tones)
function generateCallEnd() {
  const duration = 0.9;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);

  const beeps = [
    [0.0, 0.12, 600, 0.35],
    [0.18, 0.12, 480, 0.35],
    [0.36, 0.22, 360, 0.35],
  ];

  for (const [startSec, durSec, freq, vol] of beeps) {
    const startSample = Math.floor(startSec * sampleRate);
    const beepSamples = Math.floor(durSec * sampleRate);

    for (let i = 0; i < beepSamples; i++) {
      const idx = startSample + i;
      if (idx >= totalSamples) break;

      const t = i / sampleRate;
      let envelope = Math.exp(-3.0 * (t / durSec));
      if (t < 0.01) envelope *= t / 0.01;

      samples[idx] += Math.sin(2 * Math.PI * freq * t) * envelope * vol;
    }
  }

  return createWavBuffer(sampleRate, samples);
}

// 4. Generate busy tone (480Hz + 620Hz, 0.5s tone, 0.5s pause)
function generateBusy() {
  const duration = 1.0;
  const toneDuration = 0.5;
  const totalSamples = Math.floor(sampleRate * duration);
  const toneSamples = Math.floor(sampleRate * toneDuration);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < toneSamples; i++) {
    const t = i / sampleRate;
    let attackRelease = 1.0;
    if (t < 0.02) attackRelease = t / 0.02;
    else if (t > toneDuration - 0.02) attackRelease = (toneDuration - t) / 0.02;

    const tone1 = Math.sin(2 * Math.PI * 480 * t);
    const tone2 = Math.sin(2 * Math.PI * 620 * t);
    samples[i] = (tone1 * 0.25 + tone2 * 0.25) * attackRelease;
  }

  return createWavBuffer(sampleRate, samples);
}

const soundsDir = path.resolve("frontend/assets/sounds");
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}

fs.writeFileSync(path.join(soundsDir, "ringtone.wav"), generateRingtone());
fs.writeFileSync(path.join(soundsDir, "ringback.wav"), generateRingback());
fs.writeFileSync(path.join(soundsDir, "call_end.wav"), generateCallEnd());
fs.writeFileSync(path.join(soundsDir, "busy.wav"), generateBusy());

console.log("Call sound effects generated successfully in", soundsDir);
