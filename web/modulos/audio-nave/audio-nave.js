/*
 * audio-nave.js — Audio ambiental procedural para La Malkevnia.
 *
 * Todo se sintetiza en el navegador con la Web Audio API: no hay samples,
 * ni ficheros de audio, ni dependencias. Módulo ES autocontenido.
 *
 *   import AudioNave from './audio-nave.js';
 *   boton.addEventListener('click', async () => {
 *     await AudioNave.init();          // SIEMPRE dentro de un gesto del usuario
 *     AudioNave.setRoom('puente');
 *   });
 *
 * Capas: motores (zumbido del reactor), ambiente (aire de la sala y pequeños
 * eventos), musica (pad generativo distinto en cada sala) y efectos (puertas,
 * pasos, pitidos). Cada capa tiene su volumen, más un volumen maestro.
 */

// ───────────────────────────── Salas ─────────────────────────────
// Los ids coinciden con las salas de la nave 3D (nave-3d/index.html).
// root: nota MIDI base · chords: acordes en semitonos desde root
// scale: notas para las campanas · chordBeats: duración de cada acorde en pulsos
// engine/air/music/reverb: niveles 0..1 de cada capa en esta sala
// events: eventos ambientales por segundo (blip, hiss, creak, chirp)
export const ROOMS = {
  pasillo: {
    name: 'Pasillo central', mood: 'Tránsito tranquilo, pad suave',
    root: 50, tempo: 70, chordBeats: 12,
    chords: [[0, 7, 14, 16], [-3, 4, 11, 14], [-7, 0, 7, 14], [-5, 2, 9, 14]],
    scale: [0, 2, 4, 7, 9],
    pad: { wave: 'sawtooth', cutoff: 900, detune: 7, level: 1 },
    bell: { density: 0.18, wave: 'bell', octave: 2, decay: 3.5 },
    engine: 0.55, air: 0.5, airCutoff: 600, music: 0.8, reverb: 0.35,
    events: { blip: 0.02 },
  },
  maquinas: {
    name: 'Sala de máquinas', mood: 'Reactor cerca, graves y vapor',
    root: 45, tempo: 60, chordBeats: 16,
    chords: [[0, 7, 12, 15], [-2, 5, 10, 14], [-4, 3, 10, 12], [-5, 2, 7, 14]],
    scale: [0, 2, 3, 7, 9],
    pad: { wave: 'sawtooth', cutoff: 480, detune: 9, level: 0.9 },
    bell: { density: 0.08, wave: 'bell', octave: 1, decay: 4 },
    engine: 1, air: 0.8, airCutoff: 320, music: 0.55, reverb: 0.5,
    events: { hiss: 0.05, creak: 0.04 },
  },
  recreativa: {
    name: 'Sala recreativa', mood: 'Videojuegos, arpegio retro',
    root: 52, tempo: 96, chordBeats: 8,
    chords: [[0, 4, 7, 11], [5, 9, 12, 16], [-3, 4, 7, 12], [2, 5, 9, 14]],
    scale: [0, 2, 4, 7, 9],
    pad: { wave: 'triangle', cutoff: 1800, detune: 5, level: 0.8 },
    bell: { density: 0.55, wave: 'square', octave: 2, decay: 0.5 },
    engine: 0.4, air: 0.35, airCutoff: 900, music: 1, reverb: 0.3,
    events: { chirp: 0.06 },
  },
  proyeccion: {
    name: 'Sala de proyección', mood: 'Terciopelo oscuro, butacas',
    root: 48, tempo: 56, chordBeats: 16,
    chords: [[0, 7, 15, 19], [-4, 3, 10, 15], [-7, 0, 8, 15], [-5, 2, 10, 14]],
    scale: [0, 3, 5, 7, 10],
    pad: { wave: 'sawtooth', cutoff: 650, detune: 8, level: 1 },
    bell: { density: 0.07, wave: 'bell', octave: 1, decay: 5 },
    engine: 0.3, air: 0.3, airCutoff: 400, music: 0.9, reverb: 0.55,
    events: {},
  },
  bitacora: {
    name: 'Bitácora', mood: 'Cajita de música para escribir',
    root: 53, tempo: 72, chordBeats: 12,
    chords: [[0, 4, 7, 14], [-3, 4, 9, 12], [5, 9, 12, 16], [-5, 2, 7, 11]],
    scale: [0, 2, 4, 7, 9, 11],
    pad: { wave: 'triangle', cutoff: 1200, detune: 6, level: 0.9 },
    bell: { density: 0.35, wave: 'musicbox', octave: 2, decay: 2.5 },
    engine: 0.35, air: 0.35, airCutoff: 500, music: 0.9, reverb: 0.4,
    events: {},
  },
  juegos: {
    name: 'Sala de juegos', mood: 'Juegos de mesa, punteo de madera',
    root: 55, tempo: 84, chordBeats: 8,
    chords: [[0, 4, 7, 10], [5, 9, 12, 16], [-2, 5, 10, 14], [0, 7, 14, 16]],
    scale: [0, 2, 4, 7, 10],
    pad: { wave: 'triangle', cutoff: 1400, detune: 6, level: 0.85 },
    bell: { density: 0.4, wave: 'pluck', octave: 1, decay: 0.9 },
    engine: 0.45, air: 0.4, airCutoff: 550, music: 0.9, reverb: 0.3,
    events: {},
  },
  biblioteca: {
    name: 'Biblioteca', mood: 'Silencio, notas muy espaciadas',
    root: 51, tempo: 54, chordBeats: 16,
    chords: [[0, 7, 14, 18], [2, 9, 14, 18], [-5, 2, 9, 14], [0, 4, 11, 14]],
    scale: [0, 2, 4, 6, 7, 11],
    pad: { wave: 'sine', cutoff: 900, detune: 4, level: 1.3 },
    bell: { density: 0.1, wave: 'bell', octave: 2, decay: 5 },
    engine: 0.2, air: 0.25, airCutoff: 350, music: 0.75, reverb: 0.45,
    events: {},
  },
  ordenador: {
    name: 'Ordenador de a bordo', mood: 'Telemetría y pitidos',
    root: 47, tempo: 108, chordBeats: 16,
    chords: [[0, 7, 14, 15], [-4, 3, 10, 14], [-2, 5, 12, 14], [-7, 0, 7, 15]],
    scale: [0, 2, 3, 7, 10],
    pad: { wave: 'square', cutoff: 600, detune: 5, level: 0.6 },
    bell: { density: 0.6, wave: 'sine', octave: 3, decay: 0.25 },
    engine: 0.4, air: 0.4, airCutoff: 1200, music: 0.7, reverb: 0.25,
    events: { blip: 0.12 },
  },
  puente: {
    name: 'Puente de mando', mood: 'Ventanal a las estrellas',
    root: 50, tempo: 64, chordBeats: 16,
    chords: [[0, 7, 16, 21], [2, 9, 14, 18], [-5, 2, 9, 16], [-1, 6, 11, 14]],
    scale: [0, 2, 4, 6, 7, 9, 11],
    pad: { wave: 'sawtooth', cutoff: 1100, detune: 10, level: 1 },
    bell: { density: 0.2, wave: 'bell', octave: 2, decay: 4.5 },
    engine: 0.3, air: 0.3, airCutoff: 2500, music: 1, reverb: 0.6,
    events: { blip: 0.03 },
  },
};

const LAYERS = ['master', 'motores', 'ambiente', 'musica', 'efectos'];
const LAYER_ALIASES = { engine: 'motores', ambient: 'ambiente', music: 'musica', fx: 'efectos', sfx: 'efectos' };
const DEFAULT_VOLUMES = { master: 0.8, motores: 0.7, ambiente: 0.6, musica: 0.6, efectos: 0.8 };

// ─────────────────────────── Estado ────────────────────────────
let ctx = null;
let nodes = null;        // grafo fijo (capas, reverb, motor, aire…)
let roomId = null;
let voices = [];         // voces de música activas (la sala actual + las que se desvanecen)
let timer = null;
let lastTick = 0;
let walking = null;
let initPromise = null;
let listeners = new Set();
const volumes = { ...DEFAULT_VOLUMES };
const options = { fade: 3, pauseWhenHidden: true };

const curve = (v) => v * v * 1.2; // curva cuadrática, más natural al oído
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const now = () => ctx.currentTime;

function emit() { const s = getState(); listeners.forEach((fn) => { try { fn(s); } catch (e) { console.error(e); } }); }

function noiseBuffer(seconds, color) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (color === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      } else d[i] = w;
    }
  }
  return buf;
}

function impulse(seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function loop(buffer) {
  const s = ctx.createBufferSource();
  s.buffer = buffer; s.loop = true;
  s.loopStart = 0; s.loopEnd = buffer.duration;
  s.start(now(), Math.random() * buffer.duration);
  return s;
}

function lfo(freq, depth, target, type = 'sine') {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = depth;
  o.connect(g).connect(target); o.start();
  return o;
}

function gain(v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }

function filter(type, freq, Q = 0.7) {
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; return f;
}

// ───────────────────────── Grafo base ──────────────────────────
function buildGraph() {
  const n = {};
  n.out = ctx.createDynamicsCompressor();
  n.out.threshold.value = -18; n.out.knee.value = 12; n.out.ratio.value = 3;
  n.out.attack.value = 0.02; n.out.release.value = 0.3;
  n.analyser = ctx.createAnalyser(); n.analyser.fftSize = 2048; n.analyser.smoothingTimeConstant = 0.85;
  n.master = gain(curve(volumes.master));
  n.master.connect(n.out); n.out.connect(n.analyser); n.analyser.connect(ctx.destination);

  // Reverb compartida: impulso generado, sin ficheros.
  n.reverb = ctx.createConvolver(); n.reverb.buffer = impulse(4.5, 3.2);
  n.reverbWet = gain(0.35);
  n.reverb.connect(n.reverbWet).connect(n.master);

  // Capas de usuario
  n.layer = {};
  for (const l of LAYERS.slice(1)) { n.layer[l] = gain(curve(volumes[l])); n.layer[l].connect(n.master); }
  const send = (node, amount) => { const s = gain(amount); node.connect(s).connect(n.reverb); };
  send(n.layer.musica, 0.9); send(n.layer.efectos, 0.35); send(n.layer.ambiente, 0.25);

  n.noise = { white: noiseBuffer(3, 'white'), pink: noiseBuffer(4, 'pink'), brown: noiseBuffer(5, 'brown') };

  // Motores: graves senoidales + ruido marrón filtrado, con respiración lenta.
  n.engineRoom = gain(0); n.engineRoom.connect(n.layer.motores);
  const eng = gain(1); eng.connect(n.engineRoom);
  lfo(0.11, 0.12, eng.gain);
  const f0 = 43.65; // Fa1, por debajo de casi toda la música
  [[f0, 'sine', 0.32, 0], [f0 * 2, 'sine', 0.16, 3], [f0 * 3, 'triangle', 0.05, -4], [f0 * 4.01, 'sine', 0.025, 0]]
    .forEach(([f, type, lvl, det]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      const g = gain(lvl); o.connect(g).connect(eng); o.start();
    });
  const rumble = loop(n.noise.brown);
  n.engineFilter = filter('lowpass', 160, 1.2);
  lfo(0.07, 40, n.engineFilter.frequency);
  rumble.connect(n.engineFilter).connect(gain(0.9)).connect(eng);
  // Un "latido" muy leve del reactor
  const pulse = gain(0.5); lfo(0.5, 0.5, pulse.gain);
  const hum = ctx.createOscillator(); hum.frequency.value = 87.3; hum.connect(gain(0.04)).connect(pulse).connect(eng); hum.start();

  // Ambiente: aire de la sala (ruido rosa filtrado) que cambia de color por sala.
  n.airRoom = gain(0); n.airRoom.connect(n.layer.ambiente);
  const air = loop(n.noise.pink);
  n.airFilter = filter('lowpass', 600, 0.5);
  const airHp = filter('highpass', 60);
  lfo(0.05, 0.25, n.airRoom.gain);
  air.connect(airHp).connect(n.airFilter).connect(gain(0.55)).connect(n.airRoom);
  n.events = gain(1); n.events.connect(n.layer.ambiente);

  return n;
}

// ─────────────────────── Música por sala ───────────────────────
function createVoice(id) {
  const room = ROOMS[id];
  const bus = gain(0);
  bus.connect(nodes.layer.musica);
  const padFilter = filter('lowpass', room.pad.cutoff, 0.9);
  lfo(0.045, room.pad.cutoff * 0.35, padFilter.frequency);
  padFilter.connect(bus);
  const bells = gain(1); bells.connect(bus);
  // Eco suave para las campanas
  const delay = ctx.createDelay(2); delay.delayTime.value = (60 / room.tempo) * 0.75;
  const fb = gain(0.32); const dlp = filter('lowpass', 2200);
  bells.connect(delay); delay.connect(dlp).connect(fb).connect(delay); dlp.connect(gain(0.5)).connect(bus);
  const t = now() + 0.05;
  return { id, room, bus, padFilter, bells, delay, nextChord: t, nextBeat: t + 60 / room.tempo, chordIdx: 0, chordNotes: room.chords[0], stopped: false };
}

function scheduleChord(v, t) {
  const r = v.room; const beat = 60 / r.tempo; const dur = r.chordBeats * beat;
  const chord = r.chords[v.chordIdx % r.chords.length];
  v.chordNotes = chord; v.chordIdx++;
  const attack = Math.min(3, dur * 0.35), release = Math.min(5, dur * 0.5);
  const peak = 0.045 * r.pad.level;
  const notes = chord.map((s) => r.root + s);
  notes.push(r.root + chord[0] - 12); // bajo
  notes.forEach((m, i) => {
    const isBass = i === notes.length - 1;
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(isBass ? peak * 1.4 : peak, t + attack);
    g.gain.setValueAtTime(isBass ? peak * 1.4 : peak, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + release);
    g.connect(isBass ? v.bus : v.padFilter);
    const oscs = isBass ? [[0, 'sine']] : [[-r.pad.detune, r.pad.wave], [r.pad.detune, r.pad.wave]];
    oscs.forEach(([det, type]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(m); o.detune.value = det;
      const pan = ctx.createStereoPanner(); pan.pan.value = isBass ? 0 : rand(-0.6, 0.6);
      o.connect(pan).connect(g); o.start(t); o.stop(t + dur + release + 0.1);
    });
  });
  return dur;
}

function scheduleBell(v, t) {
  const r = v.room; const b = r.bell;
  const m = r.root + 12 * b.octave + pick(r.scale) + (Math.random() < 0.2 ? 12 : 0);
  playTone(v.bells, mtof(m), t, b.wave, b.decay, 0.11, rand(-0.7, 0.7));
}

function playTone(dest, f, t, wave, decay, level, panV = 0) {
  const g = gain(0); const pan = ctx.createStereoPanner(); pan.pan.value = panV;
  g.connect(pan).connect(dest);
  const atk = wave === 'pluck' ? 0.003 : 0.008;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  const end = t + decay + 0.05;
  const osc = (type, freq, lvl, to = g) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const og = gain(lvl); o.connect(og).connect(to); o.start(t); o.stop(end); return o;
  };
  if (wave === 'bell') { osc('sine', f, 1); osc('sine', f * 2.76, 0.25); osc('sine', f * 5.4, 0.06); }
  else if (wave === 'musicbox') { osc('sine', f, 1); osc('sine', f * 4, 0.18); osc('triangle', f * 2, 0.1); }
  else if (wave === 'pluck') {
    const lp = filter('lowpass', f * 6, 2); lp.connect(g);
    lp.frequency.setValueAtTime(f * 8, t); lp.frequency.exponentialRampToValueAtTime(f * 1.2, t + decay * 0.8);
    osc('triangle', f, 1, lp); osc('sawtooth', f * 1.003, 0.3, lp);
  } else if (wave === 'square') {
    const lp = filter('lowpass', 2200, 0.5); lp.connect(g); osc('square', f, 0.35, lp);
  } else osc('sine', f, 1);
}

// ──────────────────── Eventos ambientales ──────────────────────
function ambientEvent(kind, t = now()) {
  const dest = nodes.events;
  if (kind === 'blip') {
    const base = pick([1318.5, 1567.98, 1760, 2093]);
    playTone(dest, base, t, 'sine', 0.12, 0.05, rand(-0.8, 0.8));
    if (Math.random() < 0.6) playTone(dest, base * pick([1.25, 1.5, 0.75]), t + 0.11, 'sine', 0.12, 0.04, rand(-0.8, 0.8));
  } else if (kind === 'hiss') {
    const s = ctx.createBufferSource(); s.buffer = nodes.noise.white;
    const bp = filter('bandpass', rand(2500, 4500), 0.8); const g = gain(0);
    const d = rand(0.8, 2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.15); g.gain.linearRampToValueAtTime(0, t + d);
    s.connect(bp).connect(g).connect(dest); s.start(t, Math.random()); s.stop(t + d + 0.1);
  } else if (kind === 'creak') {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const f = rand(70, 120); o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * rand(0.8, 1.3), t + 1.2);
    const bp = filter('bandpass', f * 4, 6); const g = gain(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.4); g.gain.linearRampToValueAtTime(0, t + 1.3);
    o.connect(bp).connect(g).connect(dest); o.start(t); o.stop(t + 1.4);
  } else if (kind === 'chirp') {
    const o = ctx.createOscillator(); o.type = 'square';
    const f = rand(600, 1200); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2, t + 0.08);
    const lp = filter('lowpass', 1800); const g = gain(0); const pan = ctx.createStereoPanner(); pan.pan.value = rand(-0.9, 0.9);
    g.gain.setValueAtTime(0.015, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(lp).connect(g).connect(pan).connect(dest); o.start(t); o.stop(t + 0.2);
  }
}

// ───────────────────────── Planificador ────────────────────────
const LOOKAHEAD = 0.5;
function tick() {
  if (!ctx || ctx.state !== 'running') return;
  const t = now(); const dt = Math.min(1, t - lastTick); lastTick = t;
  for (const v of voices) {
    if (v.stopped) continue;
    while (v.nextChord < t + LOOKAHEAD) v.nextChord += scheduleChord(v, Math.max(v.nextChord, t));
    const beat = 60 / v.room.tempo;
    while (v.nextBeat < t + LOOKAHEAD) {
      if (Math.random() < v.room.bell.density) scheduleBell(v, Math.max(v.nextBeat, t));
      v.nextBeat += beat * (Math.random() < 0.25 ? 0.5 : 1);
    }
  }
  const room = ROOMS[roomId];
  if (room) for (const [k, rate] of Object.entries(room.events)) if (Math.random() < rate * dt) ambientEvent(k, t + 0.05);
}

// ───────────────────────────── API ─────────────────────────────

/**
 * Crea el contexto de audio y arranca las capas. Llamar dentro de un gesto
 * del usuario (click, tecla, toque). Se puede llamar varias veces: devuelve
 * la misma promesa.
 * @param {{room?: string, fade?: number, volumes?: object, pauseWhenHidden?: boolean}} [opts]
 */
export function init(opts = {}) {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    Object.assign(options, opts);
    if (opts.volumes) for (const [k, v] of Object.entries(opts.volumes)) volumes[LAYER_ALIASES[k] || k] = v;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Este navegador no tiene Web Audio API');
    ctx = new AC({ latencyHint: 'playback' });
    if (ctx.state === 'suspended') await ctx.resume();
    nodes = buildGraph();
    lastTick = now();
    timer = setInterval(tick, 100);
    if (options.pauseWhenHidden) document.addEventListener('visibilitychange', onVisibility);
    const first = opts.room || roomId || 'pasillo'; roomId = null;
    setRoom(first, { fade: 2 });
    emit();
    return getState();
  })();
  initPromise.catch(() => { initPromise = null; });
  return initPromise;
}

function onVisibility() {
  if (!ctx) return;
  if (document.hidden) ctx.suspend(); else ctx.resume().then(() => { lastTick = now(); });
}

/**
 * Cambia de sala con fundido cruzado de la música, el motor, el aire y la reverb.
 * @param {string} id uno de Object.keys(ROOMS)
 * @param {{fade?: number}} [opts] segundos de fundido (por defecto 3)
 */
export function setRoom(id, opts = {}) {
  if (!ROOMS[id]) { console.warn(`[audio-nave] sala desconocida "${id}", uso "pasillo"`); id = 'pasillo'; }
  if (!ctx) { roomId = id; return; }   // se aplicará en init()
  if (id === roomId && voices.some((v) => v.id === id && !v.stopped)) return;
  const fade = opts.fade ?? options.fade;
  const t = now(); const tc = Math.max(0.05, fade / 3);
  const room = ROOMS[id];
  for (const v of voices) if (!v.stopped) {
    v.stopped = true;
    v.bus.gain.cancelScheduledValues(t); v.bus.gain.setValueAtTime(v.bus.gain.value, t);
    v.bus.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => { v.bus.disconnect(); voices = voices.filter((x) => x !== v); }, (fade + 0.3) * 1000);
  }
  const nv = createVoice(id);
  nv.bus.gain.setValueAtTime(0, t); nv.bus.gain.linearRampToValueAtTime(room.music, t + fade);
  voices.push(nv);
  nodes.engineRoom.gain.setTargetAtTime(room.engine, t, tc);
  nodes.airRoom.gain.setTargetAtTime(room.air, t, tc);
  nodes.airFilter.frequency.setTargetAtTime(room.airCutoff, t, tc);
  nodes.engineFilter.frequency.setTargetAtTime(110 + room.engine * 120, t, tc);
  nodes.reverbWet.gain.setTargetAtTime(room.reverb, t, tc);
  roomId = id;
  emit();
}

/**
 * Puerta neumática: aviso de dos tonos, siseo y golpe de cierre.
 * @param {'open'|'close'} [kind]
 * @param {{pan?: number}} [opts] -1 izquierda … 1 derecha
 */
export function playDoor(kind = 'open', opts = {}) {
  if (!ctx) return;
  const t = now() + 0.01; const out = ctx.createStereoPanner(); out.pan.value = opts.pan ?? 0;
  out.connect(nodes.layer.efectos);
  const open = kind !== 'close';
  // Aviso
  const tones = open ? [880, 1318.5] : [1318.5, 880];
  tones.forEach((f, i) => playTone(out, f, t + i * 0.09, 'sine', 0.35, 0.05));
  // Siseo neumático
  const s = ctx.createBufferSource(); s.buffer = nodes.noise.white;
  const bp = filter('bandpass', open ? 2400 : 700, 1.1); const g = gain(0);
  const ts = t + 0.12, d = open ? 0.75 : 0.6;
  bp.frequency.setValueAtTime(open ? 2400 : 700, ts);
  bp.frequency.exponentialRampToValueAtTime(open ? 500 : 2000, ts + d);
  g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(0.32, ts + 0.04); g.gain.exponentialRampToValueAtTime(0.001, ts + d);
  s.connect(bp).connect(g).connect(out); s.start(ts, Math.random()); s.stop(ts + d + 0.05);
  // Motor de la hoja
  const m = ctx.createOscillator(); m.type = 'sawtooth'; m.frequency.setValueAtTime(open ? 70 : 90, ts);
  m.frequency.linearRampToValueAtTime(open ? 110 : 60, ts + d);
  const mlp = filter('lowpass', 300); const mg = gain(0);
  mg.gain.setValueAtTime(0, ts); mg.gain.linearRampToValueAtTime(0.06, ts + 0.1); mg.gain.linearRampToValueAtTime(0, ts + d);
  m.connect(mlp).connect(mg).connect(out); m.start(ts); m.stop(ts + d + 0.05);
  // Golpe
  const tk = ts + d - 0.08; const k = ctx.createOscillator(); k.type = 'sine';
  k.frequency.setValueAtTime(open ? 95 : 120, tk); k.frequency.exponentialRampToValueAtTime(42, tk + 0.25);
  const kg = gain(0); kg.gain.setValueAtTime(0, tk); kg.gain.linearRampToValueAtTime(open ? 0.35 : 0.5, tk + 0.008);
  kg.gain.exponentialRampToValueAtTime(0.001, tk + 0.35);
  k.connect(kg).connect(out); k.start(tk); k.stop(tk + 0.4);
  setTimeout(() => out.disconnect(), 2000);
}

let stepSide = 1;
/**
 * Un paso sobre la cubierta.
 * @param {{surface?: 'metal'|'moqueta'|'rejilla', intensity?: number}} [opts]
 */
export function footstep(opts = {}) {
  if (!ctx) return;
  const surface = opts.surface || 'metal'; const k = opts.intensity ?? 1;
  const t = now() + 0.005; stepSide = -stepSide;
  const out = ctx.createStereoPanner(); out.pan.value = stepSide * 0.18; out.connect(nodes.layer.efectos);
  const soft = surface === 'moqueta';
  // Roce (ruido corto)
  const s = ctx.createBufferSource(); s.buffer = nodes.noise.white;
  const lp = filter('lowpass', soft ? rand(500, 700) : rand(1100, 1600), 0.8); const g = gain(0);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * k, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + (soft ? 0.12 : 0.08));
  s.connect(lp).connect(g).connect(out); s.start(t, Math.random() * 2); s.stop(t + 0.15);
  // Golpe del talón
  const o = ctx.createOscillator(); o.type = 'sine'; const f = rand(75, 95);
  o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.09);
  const og = gain(0); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.3 * k, t + 0.005); og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(og).connect(out); o.start(t); o.stop(t + 0.16);
  // Resonancia de la chapa
  if (!soft) {
    const r = ctx.createBufferSource(); r.buffer = nodes.noise.white;
    const bp = filter('bandpass', surface === 'rejilla' ? rand(3200, 3800) : rand(2000, 2600), 14); const rg = gain(0);
    rg.gain.setValueAtTime(0, t); rg.gain.linearRampToValueAtTime((surface === 'rejilla' ? 0.5 : 0.3) * k, t + 0.004);
    rg.gain.exponentialRampToValueAtTime(0.001, t + (surface === 'rejilla' ? 0.25 : 0.16));
    r.connect(bp).connect(rg).connect(out); r.start(t, Math.random() * 2); r.stop(t + 0.3);
  }
  setTimeout(() => out.disconnect(), 600);
}

/**
 * Pasos automáticos (útil mientras el jugador se mueve). setWalking(false) para.
 * @param {boolean} on
 * @param {{rate?: number, surface?: string}} [opts] rate en pasos por segundo (por defecto 1.8)
 */
export function setWalking(on, opts = {}) {
  if (walking) { clearTimeout(walking.timer); walking = null; }
  if (!on || !ctx) { emit(); return; }
  walking = { rate: opts.rate || 1.8, surface: opts.surface };
  const step = () => {
    if (!walking) return;
    footstep({ surface: walking.surface, intensity: rand(0.85, 1) });
    walking.timer = setTimeout(step, (1000 / walking.rate) * rand(0.94, 1.06));
  };
  step(); emit();
}

/** Pitido de interfaz (consola, menús). */
export function beep(kind = 'ok') {
  if (!ctx) return;
  const t = now() + 0.005; const out = nodes.layer.efectos;
  if (kind === 'error') { playTone(out, 330, t, 'square', 0.18, 0.05); playTone(out, 262, t + 0.12, 'square', 0.25, 0.05); }
  else { playTone(out, 1568, t, 'sine', 0.15, 0.06); playTone(out, 2093, t + 0.07, 'sine', 0.2, 0.05); }
}

/**
 * Volumen de una capa (0..1): 'master', 'motores', 'ambiente', 'musica', 'efectos'
 * (también acepta engine, ambient, music, fx).
 */
export function setVolume(layer, value) {
  const l = LAYER_ALIASES[layer] || layer;
  if (!LAYERS.includes(l)) { console.warn(`[audio-nave] capa desconocida "${layer}"`); return; }
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  volumes[l] = v;
  if (ctx) {
    const node = l === 'master' ? nodes.master : nodes.layer[l];
    if (!(l === 'master' && nodes.muted)) node.gain.setTargetAtTime(curve(v), now(), 0.05);
  }
  emit();
}

export function getVolume(layer) { return volumes[LAYER_ALIASES[layer] || layer]; }

/** Silencia o restaura todo sin perder los volúmenes. */
export function setMuted(muted) {
  if (!ctx) return;
  nodes.master.gain.setTargetAtTime(muted ? 0 : curve(volumes.master), now(), 0.08);
  nodes.muted = muted; emit();
}

/** AnalyserNode de la salida, para visualizadores. null antes de init(). */
export function getAnalyser() { return nodes ? nodes.analyser : null; }

export function getState() {
  return {
    running: !!ctx && ctx.state === 'running',
    room: roomId, roomName: roomId ? ROOMS[roomId].name : null,
    volumes: { ...volumes }, muted: !!(nodes && nodes.muted), walking: !!walking,
  };
}

/** Suscribirse a cambios de estado. Devuelve la función para desuscribirse. */
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Para todo y libera el contexto. Después se puede volver a llamar a init(). */
export async function dispose() {
  setWalking(false);
  clearInterval(timer); timer = null;
  document.removeEventListener('visibilitychange', onVisibility);
  voices = []; roomId = null;
  const c = ctx; ctx = null; nodes = null; initPromise = null;
  if (c) await c.close();
  emit();
}

const AudioNave = { ROOMS, init, setRoom, playDoor, footstep, setWalking, beep, setVolume, getVolume, setMuted, getAnalyser, getState, onChange, dispose };
export default AudioNave;
