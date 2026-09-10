let audioContext = null;
let lastImpactAt = 0;
let lastUiCueAt = 0;

function context() {
  if (audioContext) return audioContext;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  audioContext = new Ctor();
  return audioContext;
}

function tone({ frequency, endFrequency, duration, gainValue, type = 'triangle' }) {
  const ctx = context();
  if (!ctx || ctx.state !== 'running') return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  if (endFrequency) {
    osc.frequency.exponentialRampToValueAtTime(endFrequency, ctx.currentTime + duration);
  }
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.01);
}

export function primeRtsAudio() {
  const ctx = context();
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
}

export function playUiCue(kind) {
  const now = performance.now();
  if (now - lastUiCueAt < 45) return;
  lastUiCueAt = now;
  if (kind === 'select') tone({ frequency: 520, endFrequency: 440, duration: 0.045, gainValue: 0.018 });
  else if (kind === 'move') tone({ frequency: 330, endFrequency: 250, duration: 0.06, gainValue: 0.02 });
  else if (kind === 'capture') tone({ frequency: 320, endFrequency: 620, duration: 0.12, gainValue: 0.022 });
  else if (kind === 'upgrade') tone({ frequency: 460, endFrequency: 760, duration: 0.1, gainValue: 0.018 });
}

export function playCombatImpact(effect) {
  if (effect?.type === 'capture') {
    playUiCue('capture');
    return;
  }
  const strength = effect?.type === 'sunken-destroyed'
    ? 1
    : (effect?.type === 'sunken-shot'
      ? 0.55
      : (effect?.type === 'unit-death' ? 0.45 : (effect?.type === 'hydra-shot' ? 0.14 : 0)));
  if (strength <= 0) return;
  const now = performance.now();
  if (now - lastImpactAt < 38) return;
  lastImpactAt = now;
  const ctx = context();
  if (!ctx || ctx.state !== 'running') return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  osc.type = effect.type === 'hydra-shot' ? 'triangle' : 'sawtooth';
  osc.frequency.setValueAtTime(effect.type === 'hydra-shot' ? 180 : 90, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.055);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.028 * strength, ctx.currentTime + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.08);
}
