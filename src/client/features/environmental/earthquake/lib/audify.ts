const TARGET_SECONDS = 3.5;
const MIN_RATE_HZ = 8000;
const MAX_RATE_HZ = 44100;
const ONSET_FRACTION = 0.06;
const PRE_PAD = 0.04;

export type QuakePlayer = {
  stop: () => void;
  setVolume: (v: number) => void;
};

function onsetIndex(samples: number[], mid: number, amp: number): number {
  const threshold = amp * ONSET_FRACTION;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs((samples[i] ?? mid) - mid) > threshold) {
      return Math.max(0, i - Math.round(samples.length * PRE_PAD));
    }
  }
  return 0;
}

export function playQuakeAudio(samples: number[], volume = 0.9): QuakePlayer | null {
  const Ctx = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx || samples.length < 2) return null;

  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    if (s < min) min = s;
    if (s > max) max = s;
  }
  const mid = (min + max) / 2;
  const amp = (max - min) / 2 || 1;

  const slice = samples.slice(onsetIndex(samples, mid, amp));
  if (slice.length < 2) return null;

  const rate = Math.min(MAX_RATE_HZ, Math.max(MIN_RATE_HZ, Math.round(slice.length / TARGET_SECONDS)));

  const ctx = new Ctx();
  const buffer = ctx.createBuffer(1, slice.length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < slice.length; i++) {
    data[i] = (((slice[i] ?? mid) - mid) / amp) * 0.9;
  }

  const gain = ctx.createGain();
  gain.gain.value = volume;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(gain).connect(ctx.destination);

  void ctx.resume().then(() => source.start());
  source.onended = () => void ctx.close().catch(() => {});

  return {
    stop: () => {
      try {
        source.stop();
      } catch {
        void 0;
      }
      void ctx.close().catch(() => {});
    },
    setVolume: (v: number) => {
      gain.gain.value = Math.min(1, Math.max(0, v));
    },
  };
}
