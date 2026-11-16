// 声音：背景音乐、音效、猫叫。现在全部是用代码合成出来的占位声音（没有用任何音频文件），
// 以后换成正式素材时，只要把下面 sfx / meow / 音乐的实现换成播放文件，调用的地方不用动。
//
// 三条通道各管各的，互不抢：
//   音乐 —— 一直轻轻地循环
//   音效 —— 点击、收获、喂食这些；同时最多响 6 个，同一个音效 60 毫秒内不重复
//   猫叫 —— 一次只叫一声，叫的时候音乐自动压低一点
// 最后都经过一个限幅器，叠在一起也不会爆音。
import { kv } from './platform/storage';

export type Sfx = 'click' | 'open' | 'close' | 'coin' | 'checkin' | 'buy' | 'eat' | 'bath' | 'play' | 'purr' | 'door' | 'return' | 'error' | 'ok';
export type Meow = 'short' | 'happy' | 'hungry' | 'sad';

const KEY = 'pet-game-audio';
export const audioSettings = { music: 0.35, sound: 0.7 };
try { const saved = JSON.parse(kv.get(KEY) ?? '{}'); if (typeof saved.music === 'number') audioSettings.music = Math.max(0, Math.min(1, saved.music)); if (typeof saved.sound === 'number') audioSettings.sound = Math.max(0, Math.min(1, saved.sound)); } catch { /* 用默认音量 */ }

let ctx: AudioContext | null = null;
let musicBus: GainNode, soundBus: GainNode, voiceBus: GainNode;
let active = 0; const lastPlayed: Partial<Record<Sfx, number>> = {}; let voiceUntil = 0;

/** 音量上限：音乐本身就该比音效小 */
const MUSIC_MAX = 0.22, SOUND_MAX = 0.5, VOICE_MAX = 0.55;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext; if (!AC) return null;
    const c: AudioContext = new AC();
    const limiter = c.createDynamicsCompressor(); limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.2;
    limiter.connect(c.destination);
    musicBus = c.createGain(); soundBus = c.createGain(); voiceBus = c.createGain();
    for (const b of [musicBus, soundBus, voiceBus]) b.connect(limiter);
    ctx = c; applyVolumes(); startMusic();
  } catch { ctx = null; }
  return ctx;
}

function applyVolumes() {
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(audioSettings.music * MUSIC_MAX, ctx.currentTime, 0.05);
  soundBus.gain.setTargetAtTime(audioSettings.sound * SOUND_MAX, ctx.currentTime, 0.05);
  voiceBus.gain.setTargetAtTime(audioSettings.sound * VOICE_MAX, ctx.currentTime, 0.05);
}

export function setVolume(kind: 'music' | 'sound', v: number) {
  audioSettings[kind] = Math.max(0, Math.min(1, v));
  kv.set(KEY, JSON.stringify(audioSettings)); applyVolumes();
}

/** 浏览器要求先有一次点击才能出声：在第一次触摸时把声音打开；切到后台时停掉 */
export function initAudio() {
  const unlock = () => { const c = ensure(); if (c && c.state === 'suspended' && !document.hidden) void c.resume(); };
  window.addEventListener('pointerdown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) void ctx.suspend(); else void ctx.resume(); });
  // 所有按钮统一的轻轻一声
  window.addEventListener('click', (e) => { const el = (e.target as HTMLElement | null)?.closest?.('button, .file'); if (el && !(el as HTMLButtonElement).disabled) sfx('click'); }, { capture: true });
}
/** 安卓 App 切到后台、回到前台时调用 */
export function pauseAudio(paused: boolean) { if (!ctx) return; if (paused) void ctx.suspend(); else void ctx.resume(); }

// ---------- 合成用的小零件 ----------

function tone(bus: GainNode, o: { type?: OscillatorType; freq: number[]; at?: number; dur: number; gain?: number; attack?: number }) {
  const c = ctx!; const t0 = c.currentTime + (o.at ?? 0); const osc = c.createOscillator(); const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq[0], t0);
  o.freq.slice(1).forEach((f, i) => osc.frequency.exponentialRampToValueAtTime(Math.max(20, f), t0 + (o.dur * (i + 1)) / (o.freq.length - 1)));
  const peak = o.gain ?? 0.5;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.008)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g); g.connect(bus); osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  return osc;
}

let noiseBuf: AudioBuffer | null = null;
function noise(bus: GainNode, o: { at?: number; dur: number; gain?: number; freq: number; q?: number; type?: BiquadFilterType }) {
  const c = ctx!;
  if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t0 = c.currentTime + (o.at ?? 0); const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = o.type ?? 'bandpass'; f.frequency.value = o.freq; f.Q.value = o.q ?? 1;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.gain ?? 0.4, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f); f.connect(g); g.connect(bus); src.start(t0); src.stop(t0 + o.dur + 0.05);
  return src;
}

// ---------- 音效 ----------

const SFX: Record<Sfx, () => number> = {
  click: () => { tone(soundBus, { freq: [700, 920], dur: 0.05, gain: 0.18 }); return 0.06; },
  open: () => { tone(soundBus, { freq: [480, 760], dur: 0.11, gain: 0.22 }); return 0.12; },
  close: () => { tone(soundBus, { freq: [720, 460], dur: 0.1, gain: 0.18 }); return 0.11; },
  coin: () => { tone(soundBus, { type: 'triangle', freq: [988, 988], dur: 0.09, gain: 0.4 }); tone(soundBus, { type: 'triangle', freq: [1319, 1319], at: 0.08, dur: 0.28, gain: 0.4 }); return 0.4; },
  checkin: () => { [523, 659, 784, 1047].forEach((f, i) => tone(soundBus, { type: 'triangle', freq: [f, f], at: i * 0.09, dur: 0.3, gain: 0.36 })); return 0.6; },
  buy: () => { noise(soundBus, { dur: 0.04, freq: 3000, gain: 0.25 }); tone(soundBus, { type: 'triangle', freq: [880, 880], at: 0.04, dur: 0.08, gain: 0.35 }); tone(soundBus, { type: 'triangle', freq: [1175, 1175], at: 0.11, dur: 0.24, gain: 0.35 }); return 0.36; },
  eat: () => { [0, 0.15, 0.3, 0.45].forEach((t, i) => noise(soundBus, { at: t, dur: 0.06, freq: 1500 + (i % 2) * 500, q: 2, gain: 0.4 })); return 0.55; },
  bath: () => { for (let i = 0; i < 7; i++) { const f = 500 + Math.random() * 700; tone(soundBus, { freq: [f, f * 1.7], at: i * 0.09 + Math.random() * 0.04, dur: 0.07, gain: 0.26 }); } noise(soundBus, { dur: 0.7, freq: 5000, type: 'highpass', gain: 0.06 }); return 0.75; },
  play: () => { tone(soundBus, { freq: [300, 720, 420], dur: 0.26, gain: 0.34 }); tone(soundBus, { freq: [360, 820, 480], at: 0.2, dur: 0.24, gain: 0.28 }); return 0.46; },
  purr: () => {
    // 呼噜：低沉的噪声，音量一抖一抖
    const c = ctx!; const src = noise(soundBus, { dur: 1.1, freq: 160, type: 'lowpass', gain: 0.9 });
    const lfo = c.createOscillator(); lfo.frequency.value = 24; const depth = c.createGain(); depth.gain.value = 0.5;
    void src; lfo.connect(depth); depth.connect(soundBus.gain); lfo.start(); lfo.stop(c.currentTime + 1.15);
    return 1.1;
  },
  door: () => { noise(soundBus, { dur: 0.12, freq: 220, type: 'lowpass', gain: 0.7 }); tone(soundBus, { type: 'triangle', freq: [1568, 1568], at: 0.14, dur: 0.4, gain: 0.22 }); return 0.55; },
  return: () => { tone(soundBus, { type: 'triangle', freq: [659, 659], dur: 0.35, gain: 0.4 }); tone(soundBus, { type: 'triangle', freq: [523, 523], at: 0.3, dur: 0.55, gain: 0.4 }); return 0.85; },
  error: () => { tone(soundBus, { type: 'square', freq: [200, 160], dur: 0.14, gain: 0.12 }); return 0.15; },
  ok: () => { tone(soundBus, { type: 'triangle', freq: [660, 660], dur: 0.08, gain: 0.32 }); tone(soundBus, { type: 'triangle', freq: [880, 880], at: 0.08, dur: 0.2, gain: 0.32 }); return 0.3; },
};

export function sfx(name: Sfx) {
  if (audioSettings.sound <= 0) return;
  const c = ensure(); if (!c || c.state !== 'running') return;
  const now = performance.now();
  if (active >= 6 || now - (lastPlayed[name] ?? -1000) < 60) return;
  // 具体动作有自己的音效时，不再叠一声通用的点击
  if (name !== 'click') lastPlayed.click = now + 80; else if ((lastPlayed.click ?? 0) > now) return;
  lastPlayed[name] = now; active++;
  let len = 0.2; try { len = SFX[name](); } catch { /* 合成失败就不响 */ }
  setTimeout(() => { active = Math.max(0, active - 1); }, len * 1000 + 30);
}

// ---------- 猫叫 ----------

const MEOWS: Record<Meow, { freq: number[]; dur: number }> = {
  short: { freq: [720, 980, 640], dur: 0.26 },
  happy: { freq: [640, 1120, 860], dur: 0.42 },
  hungry: { freq: [520, 760, 700, 400], dur: 0.75 },
  sad: { freq: [620, 560, 400], dur: 0.6 },
};

export function meow(kind: Meow) {
  if (audioSettings.sound <= 0) return;
  const c = ensure(); if (!c || c.state !== 'running') return;
  if (c.currentTime < voiceUntil) return; // 一次只叫一声
  const m = MEOWS[kind]; const t0 = c.currentTime; voiceUntil = t0 + m.dur + 0.25;
  const pitch = 0.92 + Math.random() * 0.16; // 每次略有不同
  const osc = c.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(m.freq[0] * pitch, t0);
  m.freq.slice(1).forEach((f, i) => osc.frequency.exponentialRampToValueAtTime(f * pitch, t0 + (m.dur * (i + 1)) / (m.freq.length - 1)));
  const vib = c.createOscillator(); vib.frequency.value = 26; const vd = c.createGain(); vd.gain.value = 14; vib.connect(vd); vd.connect(osc.frequency);
  // 两个共振峰，让锯齿波听起来像「喵」而不是电子音
  const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 3; f1.frequency.setValueAtTime(900, t0); f1.frequency.linearRampToValueAtTime(1500, t0 + m.dur * 0.4); f1.frequency.linearRampToValueAtTime(800, t0 + m.dur);
  const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 5; f2.frequency.value = 2600;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.05); g.gain.setValueAtTime(0.9, t0 + m.dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + m.dur);
  const g2 = c.createGain(); g2.gain.value = 0.35;
  osc.connect(f1); f1.connect(g); osc.connect(f2); f2.connect(g2); g2.connect(g); g.connect(voiceBus);
  osc.start(t0); vib.start(t0); osc.stop(t0 + m.dur + 0.05); vib.stop(t0 + m.dur + 0.05);
  // 叫的时候把音乐压低一点
  const base = audioSettings.music * MUSIC_MAX;
  musicBus.gain.cancelScheduledValues(t0); musicBus.gain.setTargetAtTime(base * 0.45, t0, 0.03); musicBus.gain.setTargetAtTime(base, t0 + m.dur + 0.1, 0.25);
}

// ---------- 背景音乐：一段慢慢的八音盒，循环 ----------

const NOTE = (n: number) => 261.63 * Math.pow(2, n / 12); // 0 = 中央 C
// 每一项：[音高（半音，null = 休止）, 拍数]。五声音阶，听起来不容易腻。
const MELODY: [number | null, number][] = [
  [7, 1], [9, 1], [12, 2], [9, 1], [7, 1], [4, 2],
  [2, 1], [4, 1], [7, 2], [4, 1], [2, 1], [0, 2],
  [4, 1], [7, 1], [9, 2], [12, 1], [14, 1], [12, 2],
  [9, 1], [7, 1], [4, 1], [2, 1], [0, 3], [null, 1],
];
const BASS = [-12, -15, -8, -12, -12, -15, -17, -12]; // 每小节（4 拍）一个低音
const BEAT = 0.62;
let nextNote = 0, melodyIndex = 0, beatCount = 0, musicTimer = 0;

function startMusic() {
  if (!ctx || musicTimer) return;
  nextNote = ctx.currentTime + 0.3;
  musicTimer = window.setInterval(() => {
    const c = ctx!; if (c.state !== 'running' || audioSettings.music <= 0) { nextNote = c.currentTime + 0.3; return; }
    while (nextNote < c.currentTime + 0.5) {
      const [n, beats] = MELODY[melodyIndex]; const at = nextNote - c.currentTime;
      if (n !== null) { tone(musicBus, { type: 'triangle', freq: [NOTE(n), NOTE(n)], at, dur: Math.min(1.6, beats * BEAT * 1.6), gain: 0.5, attack: 0.01 }); tone(musicBus, { freq: [NOTE(n + 12), NOTE(n + 12)], at, dur: 0.5, gain: 0.12 }); }
      if (beatCount % 4 === 0) { const b = BASS[(beatCount / 4) % BASS.length]; tone(musicBus, { freq: [NOTE(b), NOTE(b)], at, dur: BEAT * 4, gain: 0.42, attack: 0.08 }); }
      beatCount += beats; nextNote += beats * BEAT; melodyIndex = (melodyIndex + 1) % MELODY.length;
      if (melodyIndex === 0) beatCount = 0;
    }
  }, 150);
}
