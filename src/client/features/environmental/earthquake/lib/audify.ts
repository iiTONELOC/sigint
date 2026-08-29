enum QuakeAudioPolicy {
  TargetSeconds = 3.5,
  MinimumRateHertz = 8000,
  MaximumRateHertz = 44100,
  OnsetFraction = 0.06,
  PrePadFraction = 0.04,
  MinimumSampleCount = 2,
  DefaultGain = 0.9,
}

type QuakePlayer = {
  stop: () => void;
};

function onsetIndex(samples: number[], mid: number, amp: number): number {
  const threshold = amp * QuakeAudioPolicy.OnsetFraction;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs((samples[i] ?? mid) - mid) > threshold) {
      return Math.max(
        0,
        i - Math.round(samples.length * QuakeAudioPolicy.PrePadFraction),
      );
    }
  }
  return 0;
}

export function playQuakeAudio(
  samples: number[],
): QuakePlayer | null {
  const Ctx = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx || samples.length < QuakeAudioPolicy.MinimumSampleCount) return null;

  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    if (s < min) min = s;
    if (s > max) max = s;
  }
  const mid = (min + max) / 2;
  const amp = (max - min) / 2 || 1;

  const slice = samples.slice(onsetIndex(samples, mid, amp));
  if (slice.length < QuakeAudioPolicy.MinimumSampleCount) return null;

  const rate = Math.min(
    QuakeAudioPolicy.MaximumRateHertz,
    Math.max(
      QuakeAudioPolicy.MinimumRateHertz,
      Math.round(slice.length / QuakeAudioPolicy.TargetSeconds),
    ),
  );

  const ctx = new Ctx();
  const buffer = ctx.createBuffer(1, slice.length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < slice.length; i++) {
    data[i] = (((slice[i] ?? mid) - mid) / amp) *
      QuakeAudioPolicy.DefaultGain;
  }

  const gain = ctx.createGain();
  gain.gain.value = QuakeAudioPolicy.DefaultGain;
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
  };
}
