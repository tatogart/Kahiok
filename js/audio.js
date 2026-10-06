// Весь звук синтезируется через WebAudio — никаких файлов.

let ctx = null;
let master, musicBus, sfxBus, noiseBuf;
let muted = false;
try { muted = localStorage.getItem('kahiok.muted') === '1'; } catch { /* ignore */ }

const listeners = new Set();
export const isMuted = () => muted;
export function onMuteChange(fn) { listeners.add(fn); }

export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('kahiok.muted', v ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.setTargetAtTime(v ? 0 : 1, ctx.currentTime, 0.03);
  listeners.forEach(fn => fn(v));
}

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.32;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.7;
    sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const midi = n => 440 * Math.pow(2, (n - 69) / 12);

function tone({ freq, type = 'sine', t = ctx.currentTime, dur = 0.2, vol = 0.3, attack = 0.006, slide, dest = sfxBus, detune = 0 }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (detune) o.detune.value = detune;
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ t = ctx.currentTime, dur = 0.05, vol = 0.2, freq = 7000, type = 'highpass', dest = sfxBus, q = 0.7 }) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

function kick(t, dest = musicBus, vol = 0.9) {
  tone({ freq: 150, slide: 42, type: 'sine', t, dur: 0.22, vol, dest });
}

// ---------- Эффекты ----------

const SFX = {
  click() { tone({ freq: 660, type: 'triangle', dur: 0.06, vol: 0.25 }); },
  pop() {
    tone({ freq: 520 + Math.random() * 200, slide: 1100, type: 'sine', dur: 0.12, vol: 0.3 });
  },
  join() {
    const t = ctx.currentTime;
    [72, 76, 79].forEach((n, i) => tone({ freq: midi(n), type: 'triangle', t: t + i * 0.06, dur: 0.18, vol: 0.22 }));
  },
  tick() { tone({ freq: 1200, type: 'square', dur: 0.04, vol: 0.12 }); noise({ dur: 0.03, vol: 0.1 }); },
  tickHigh() { tone({ freq: 1760, type: 'square', dur: 0.06, vol: 0.16 }); },
  gong() {
    const t = ctx.currentTime;
    [55, 110.5, 165.8, 221, 277].forEach((f, i) =>
      tone({ freq: f, type: 'sine', t, dur: 2.2 - i * 0.3, vol: 0.4 / (i + 1), attack: 0.004 }));
    noise({ t, dur: 0.25, vol: 0.25, freq: 2500, type: 'bandpass' });
  },
  correct() {
    const t = ctx.currentTime;
    [72, 76, 79, 84].forEach((n, i) => tone({ freq: midi(n), type: 'triangle', t: t + i * 0.08, dur: 0.35, vol: 0.25 }));
    tone({ freq: midi(88), type: 'sine', t: t + 0.32, dur: 0.6, vol: 0.18 });
  },
  wrong() {
    const t = ctx.currentTime;
    tone({ freq: 220, slide: 150, type: 'sawtooth', t, dur: 0.35, vol: 0.14 });
    tone({ freq: 207, slide: 120, type: 'sawtooth', t: t + 0.18, dur: 0.5, vol: 0.14 });
  },
  whoosh() { noise({ dur: 0.45, vol: 0.25, freq: 1200, type: 'bandpass', q: 1.2 }); },
  reveal() {
    const t = ctx.currentTime;
    tone({ freq: midi(67), type: 'triangle', t, dur: 0.15, vol: 0.2 });
    tone({ freq: midi(74), type: 'triangle', t: t + 0.09, dur: 0.3, vol: 0.2 });
  },
  drumroll(dur = 2.5) {
    const t0 = ctx.currentTime;
    const n = Math.floor(dur * 22);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      noise({ t: t0 + i / 22, dur: 0.06, vol: 0.08 + k * 0.2, freq: 1800, type: 'bandpass', q: 0.9 });
    }
  },
  fanfare() {
    const t = ctx.currentTime;
    const seq = [[67, 0], [72, 0.14], [76, 0.28], [79, 0.42], [76, 0.62], [79, 0.76]];
    seq.forEach(([n, d]) => {
      tone({ freq: midi(n), type: 'sawtooth', t: t + d, dur: 0.3, vol: 0.12 });
      tone({ freq: midi(n), type: 'square', t: t + d, dur: 0.3, vol: 0.06, detune: 8 });
    });
    [60, 64, 67, 72].forEach(n => tone({ freq: midi(n), type: 'sawtooth', t: t + 0.95, dur: 1.4, vol: 0.08 }));
    [0, 0.95].forEach(d => { kick(t + d, sfxBus, 0.6); noise({ t: t + d, dur: 0.6, vol: 0.2, freq: 5000 }); });
  },
  medal() {
    const t = ctx.currentTime;
    [84, 88, 91, 96].forEach((n, i) => tone({ freq: midi(n), type: 'sine', t: t + i * 0.05, dur: 0.8, vol: 0.12 }));
  }
};

export function sfx(name, ...args) {
  if (!unlock() || !SFX[name]) return;
  try { SFX[name](...args); } catch (e) { console.warn(e); }
}

// ---------- Музыка (простой секвенсор) ----------

const SONGS = {
  lobby: {
    bpm: 116,
    // Am - F - C - G
    chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    play(step, t, spb) {
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      const ch = this.chords[bar];
      if (s === 0 || s === 8) kick(t, musicBus, 0.7);
      if (s % 4 === 2) noise({ t, dur: 0.04, vol: 0.12, dest: musicBus });
      if (s === 4 || s === 12) noise({ t, dur: 0.12, vol: 0.14, freq: 1800, type: 'bandpass', dest: musicBus });
      if ([0, 3, 6, 8, 11, 14].includes(s)) tone({ freq: midi(ch[0] - 12), type: 'triangle', t, dur: spb * 2, vol: 0.4, dest: musicBus });
      if (s % 2 === 0) {
        const arp = [0, 1, 2, 1, 2, 0, 1, 2][(s / 2) % 8];
        const oct = s >= 8 ? 12 : 0;
        tone({ freq: midi(ch[arp] + 12 + oct), type: 'square', t, dur: spb * 1.3, vol: 0.05, dest: musicBus });
      }
      if (s === 0) ch.forEach(n => tone({ freq: midi(n + 12), type: 'sine', t, dur: spb * 15, vol: 0.05, attack: 0.08, dest: musicBus }));
    }
  },
  question: {
    bpm: 132,
    play(step, t, spb) {
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      const root = [40, 40, 41, 39][bar];
      if (s % 4 === 0) kick(t, musicBus, 0.6);
      noise({ t, dur: 0.03, vol: s % 2 ? 0.05 : 0.09, dest: musicBus });
      if (s % 2 === 0) tone({ freq: midi(root + (s % 4 === 2 ? 12 : 0)), type: 'sawtooth', t, dur: spb * 1.6, vol: 0.12, dest: musicBus });
      if (s === 0 || s === 6 || s === 12) {
        const mel = [[76, 79, 83], [76, 79, 81], [77, 81, 84], [75, 78, 83]][bar];
        tone({ freq: midi(mel[s / 6]), type: 'triangle', t, dur: spb * 3, vol: 0.09, dest: musicBus });
      }
    }
  },
  results: {
    bpm: 100,
    chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    play(step, t, spb) {
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      const ch = this.chords[bar];
      if (s === 0 || s === 10) kick(t, musicBus, 0.5);
      if (s % 4 === 2) noise({ t, dur: 0.05, vol: 0.08, dest: musicBus });
      if (s === 0 || s === 8) tone({ freq: midi(ch[0] - 12), type: 'triangle', t, dur: spb * 6, vol: 0.35, dest: musicBus });
      if (s % 4 === 0) tone({ freq: midi(ch[(s / 4) % 3] + 12), type: 'sine', t, dur: spb * 3, vol: 0.08, dest: musicBus });
    }
  }
};

let seqTimer = null;
let seqGain = null;
let currentSong = null;

export function music(name) {
  if (name === currentSong) return;
  stopMusic();
  if (!name || !unlock()) return;
  const song = SONGS[name];
  if (!song) return;
  currentSong = name;
  // Отдельный гейн на трек, чтобы мягко глушить при остановке
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(musicBus);
  seqGain = bus;
  const realBus = musicBus;
  let step = 0;
  let next = ctx.currentTime + 0.08;
  const spb = 60 / song.bpm / 4;
  const tickFn = () => {
    musicBus = bus; // секвенсор пишет в шину текущего трека
    while (next < ctx.currentTime + 0.25) {
      song.play(step, next, spb);
      step++;
      next += spb;
    }
    musicBus = realBus;
  };
  tickFn();
  seqTimer = setInterval(tickFn, 60);
}

export function stopMusic() {
  currentSong = null;
  if (seqTimer) clearInterval(seqTimer);
  seqTimer = null;
  if (seqGain && ctx) {
    const g = seqGain;
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
    setTimeout(() => g.disconnect(), 800);
  }
  seqGain = null;
}
