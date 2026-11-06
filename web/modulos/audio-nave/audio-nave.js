/*
 * audio-nave.js — Audio ambiental procedural para La Malkevnia.
 *
 * Todo se sintetiza en el navegador con la Web Audio API: no hay samples,
 * ni ficheros de audio, ni dependencias. Módulo ES autocontenido. Se puede
 * importar en el servidor (Astro, SSR) sin romper nada: no toca window ni
 * document hasta que se llama a init().
 *
 *   import AudioNave from './audio-nave.js';
 *   boton.addEventListener('click', async () => {
 *     await AudioNave.init({ room: 'puente' });   // dentro de un gesto del usuario
 *   });
 *
 * Capas: motores (zumbido del reactor), ambiente (aire, texturas y pequeños
 * sonidos de cada sala), musica (pad generativo distinto en cada sala) y
 * efectos (puertas, pasos, pitidos). Cada capa tiene su volumen, más un maestro.
 */

// ───────────────────────────── Salas ─────────────────────────────
// Los ids coinciden con las salas de la nave 3D (nave-3d/rooms.json).
//   root        nota MIDI base de la música
//   chords      acordes, en semitonos desde root
//   scale       notas disponibles para las campanas
//   chordBeats  duración de cada acorde, en pulsos
//   pad         timbre del colchón (onda, corte del filtro, desafinación, nivel)
//   bell        campanas: densidad 0..1 por pulso, timbre, octava, caída en s,
//               pattern 'arp' = arpegio ordenado en corcheas en vez de notas sueltas
//   engine/air/music/reverb  niveles 0..1 de cada capa en esta sala
//   airCutoff   color del aire (Hz)
//   floor       suelo por defecto para los pasos: metal | rejilla | moqueta | madera
//   texture     sonido continuo propio: turbine | projector | servers | stars | clock
//   events      sonidos sueltos por segundo: blip, hiss, creak, chirp, tick, typing, dice
export const ROOMS = {
  pasillo: {
    name: 'Pasillo central', mood: 'Tránsito tranquilo, pad suave',
    root: 50, tempo: 70, chordBeats: 12,
    chords: [[0, 7, 14, 16], [-3, 4, 11, 14], [-7, 0, 7, 14], [-5, 2, 9, 14]],
    scale: [0, 2, 4, 7, 9],
    pad: { wave: 'sawtooth', cutoff: 900, detune: 7, level: 1 },
    bell: { density: 0.18, wave: 'bell', octave: 2, decay: 3.5 },
    engine: 0.55, air: 0.5, airCutoff: 600, music: 0.8, reverb: 0.4,
    floor: 'metal', texture: null,
    events: { blip: 0.02, tick: 0.03 },
  },
  maquinas: {
    name: 'Sala de máquinas', mood: 'Reactor cerca, turbina y vapor',
    root: 45, tempo: 60, chordBeats: 16,
    chords: [[0, 7, 12, 15], [-2, 5, 10, 14], [-4, 3, 10, 12], [-5, 2, 7, 14]],
    scale: [0, 2, 3, 7, 9],
    pad: { wave: 'sawtooth', cutoff: 480, detune: 9, level: 0.9 },
    bell: { density: 0.08, wave: 'bell', octave: 1, decay: 4 },
    engine: 1, air: 0.8, airCutoff: 320, music: 0.5, reverb: 0.5,
    floor: 'rejilla', texture: 'turbine',
    events: { hiss: 0.05, creak: 0.04, tick: 0.05 },
  },
  recreativa: {
    name: 'Sala recreativa', mood: 'Videojuegos, arpegio retro',
    root: 52, tempo: 96, chordBeats: 8,
    chords: [[0, 4, 7, 11], [5, 9, 12, 16], [-3, 4, 7, 12], [2, 5, 9, 14]],
    scale: [0, 2, 4, 7, 9],
    pad: { wave: 'triangle', cutoff: 1800, detune: 5, level: 0.8 },
    bell: { density: 0.6, wave: 'square', octave: 2, decay: 0.45, pattern: 'arp' },
    engine: 0.4, air: 0.35, airCutoff: 900, music: 0.95, reverb: 0.3,
    floor: 'metal', texture: null,
    events: { chirp: 0.06 },
  },
  proyeccion: {
    name: 'Sala de proyección', mood: 'Terciopelo oscuro y proyector',
    root: 48, tempo: 56, chordBeats: 16,
    chords: [[0, 7, 15, 19], [-4, 3, 10, 15], [-7, 0, 8, 15], [-5, 2, 10, 14]],
    scale: [0, 3, 5, 7, 10],
    pad: { wave: 'sawtooth', cutoff: 650, detune: 8, level: 1 },
    bell: { density: 0.07, wave: 'bell', octave: 1, decay: 5 },
    engine: 0.3, air: 0.3, airCutoff: 400, music: 0.9, reverb: 0.55,
    floor: 'moqueta', texture: 'projector',
    events: {},
  },
  bitacora: {
    name: 'Bitácora', mood: 'Cajita de música y teclas',
    root: 53, tempo: 72, chordBeats: 12,
    chords: [[0, 4, 7, 14], [-3, 4, 9, 12], [5, 9, 12, 16], [-5, 2, 7, 11]],
    scale: [0, 2, 4, 7, 9, 11],
    pad: { wave: 'triangle', cutoff: 1200, detune: 6, level: 0.9 },
    bell: { density: 0.35, wave: 'musicbox', octave: 2, decay: 2.5 },
    engine: 0.35, air: 0.35, airCutoff: 500, music: 0.9, reverb: 0.4,
    floor: 'moqueta', texture: null,
    events: { typing: 0.035 },
  },
  juegos: {
    name: 'Sala de juegos', mood: 'Juegos de mesa, madera y dados',
    root: 55, tempo: 84, chordBeats: 8,
    chords: [[0, 4, 7, 10], [5, 9, 12, 16], [-2, 5, 10, 14], [0, 7, 14, 16]],
    scale: [0, 2, 4, 7, 10],
    pad: { wave: 'triangle', cutoff: 1400, detune: 6, level: 0.85 },
    bell: { density: 0.4, wave: 'pluck', octave: 1, decay: 0.9 },
    engine: 0.45, air: 0.4, airCutoff: 550, music: 0.9, reverb: 0.3,
    floor: 'madera', texture: null,
    events: { dice: 0.025 },
  },
  biblioteca: {
    name: 'Biblioteca', mood: 'Silencio y un reloj',
    root: 51, tempo: 54, chordBeats: 16,
    chords: [[0, 7, 14, 18], [2, 9, 14, 18], [-5, 2, 9, 14], [0, 4, 11, 14]],
    scale: [0, 2, 4, 6, 7, 11],
    pad: { wave: 'sine', cutoff: 900, detune: 4, level: 1.3 },
    bell: { density: 0.1, wave: 'bell', octave: 2, decay: 5 },
    engine: 0.2, air: 0.25, airCutoff: 350, music: 0.75, reverb: 0.45,
    floor: 'moqueta', texture: 'clock',
    events: {},
  },
  ordenador: {
    name: 'Ordenador de a bordo', mood: 'Telemetría, servidores y pitidos',
    root: 47, tempo: 108, chordBeats: 16,
    chords: [[0, 7, 14, 15], [-4, 3, 10, 14], [-2, 5, 12, 14], [-7, 0, 7, 15]],
    scale: [0, 2, 3, 7, 10],
    pad: { wave: 'square', cutoff: 600, detune: 5, level: 0.6 },
    bell: { density: 0.5, wave: 'sine', octave: 2, decay: 0.25, pattern: 'arp' },
    engine: 0.4, air: 0.4, airCutoff: 1200, music: 0.7, reverb: 0.25,
    floor: 'metal', texture: 'servers',
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
    floor: 'metal', texture: 'stars',
    events: { blip: 0.03, tick: 0.02 },
  },
};

export const SURFACES = ['metal', 'rejilla', 'moqueta', 'madera'];
const LAYERS = ['master', 'motores', 'ambiente', 'musica', 'efectos'];
const LAYER_ALIASES = { engine: 'motores', ambient: 'ambiente', music: 'musica', fx: 'efectos', sfx: 'efectos' };
const DEFAULT_VOLUMES = { master: 0.8, motores: 0.7, ambiente: 0.6, musica: 0.6, efectos: 0.8 };
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'];

// ─────────────────────────── Estado ────────────────────────────
let ctx = null;
let nodes = null;          // grafo fijo: capas, reverb, motor, aire
let roomId = null;
let voices = [];           // música y textura de la sala actual + las que se apagan
let timer = null;
let lastTick = 0;
let walking = null;
let initPromise = null;
let muted = false;
let pausedByHidden = false;
let unlock = null;
let stepSide = 1;
const listeners = new Set();
const volumes = { ...DEFAULT_VOLUMES };
const options = { fade: 3, pauseWhenHidden: true };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const curve = (v) => v * v * 1.2;                 // curva cuadrática, más natural al oído
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const now = () => ctx.currentTime;
const running = () => !!ctx && ctx.state === 'running';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const layerName = (l) => LAYER_ALIASES[l] || l;

function emit() {
  const s = getState();
  listeners.forEach((fn) => { try { fn(s); } catch (e) { console.error(e); } });
}

// ───────────────────── Piezas de síntesis ──────────────────────
function gain(v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }
function filter(type, freq, Q = 0.7) {
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; return f;
}
function panner(v = 0) {
  if (!ctx.createStereoPanner) return gain(1);   // Safari antiguo
  const p = ctx.createStereoPanner(); p.pan.value = clamp(v, -1, 1); return p;
}
function osc(type, freq, start = true) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; if (start) o.start(); return o;
}
/** Oscilador lento que modula un parámetro. Devuelve el oscilador para poder pararlo. */
function lfo(freq, depth, target, type = 'sine') {
  const o = osc(type, freq); const g = gain(depth); o.connect(g).connect(target); o.depth = g; return o;
}
/**
 * Desconecta los nodos de un sonido de un solo uso cuando terminan todas sus
 * fuentes, para que una sesión larga no acumule nodos colgando del grafo.
 */
function release(nodeList, sources) {
  let left = sources.length;
  const done = () => { if (--left === 0) nodeList.forEach((n) => n.disconnect()); };
  sources.forEach((src) => src.addEventListener('ended', done));
}
function loop(buffer) {
  const s = ctx.createBufferSource();
  s.buffer = buffer; s.loop = true;
  s.start(now(), Math.random() * buffer.duration);
  return s;
}
/** Mantiene el valor actual de un parámetro y borra lo programado después. */
function hold(param, t) {
  if (param.cancelAndHoldAtTime) { param.cancelAndHoldAtTime(t); return; }
  const v = param.value; param.cancelScheduledValues(t); param.setValueAtTime(v, t);
}
function rampTo(param, value, t, secs) {
  hold(param, t);
  if (secs > 0) param.linearRampToValueAtTime(value, t + secs); else param.setValueAtTime(value, t);
}
function glide(param, value, t, secs = 0.05) { hold(param, t); param.setTargetAtTime(value, t, secs); }

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
    // Fundido de 20 ms en el punto de bucle para que no haga clic al repetirse.
    const xf = Math.floor(ctx.sampleRate * 0.02);
    for (let i = 0; i < xf; i++) { const k = i / xf; d[i] = d[i] * k + d[len - xf + i] * (1 - k); }
  }
  return buf;
}

/** Respuesta al impulso de una sala metálica: predelay, primeras reflexiones y cola que se oscurece. */
function impulse(seconds, decay, predelay) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds), p = Math.floor(sr * predelay);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let y = 0;
    for (let i = p; i < len; i++) {
      const k = (i - p) / (len - p);
      const x = (Math.random() * 2 - 1) * Math.pow(1 - k, decay);
      y += (0.85 - 0.8 * k) * (x - y);           // filtro paso bajo que se cierra con el tiempo
      d[i] = y;
    }
    for (let r = 0; r < 7; r++) d[p + Math.floor(sr * rand(0.003, 0.07))] += rand(-0.6, 0.6) * (1 - r / 9);
  }
  return buf;
}

/** Golpe de ruido filtrado (pasos, puertas, teclas, dados). */
function noiseHit(dest, t, lvl, type, f, Q, len) {
  const s = ctx.createBufferSource(); s.buffer = nodes.noise.white;
  const g = gain(0), fl = filter(type, f, Q);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0005, t + len);
  s.connect(fl).connect(g).connect(dest);
  s.start(t, Math.random() * (nodes.noise.white.duration - 0.5)); s.stop(t + len + 0.02);
  release([s, fl, g], [s]);
  return s;
}

/** Golpe grave con caída de tono (talón, cierre de puerta). */
function thud(dest, t, f, lvl, len, fEnd = 0.5) {
  const o = osc('sine', f, false);
  o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * fEnd, t + len * 0.7);
  const g = gain(0);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0005, t + len);
  o.connect(g).connect(dest); o.start(t); o.stop(t + len + 0.02);
  release([o, g], [o]);
  return o;
}

/** Nota con envolvente de percusión. Timbres: bell, musicbox, pluck, square, sine. Devuelve sus fuentes. */
function playTone(dest, f, t, wave, decay, level, panV = 0) {
  const g = gain(0), pan = panner(panV);
  const own = [g, pan], srcs = [];
  g.connect(pan).connect(dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + (wave === 'pluck' ? 0.003 : 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  const end = t + decay + 0.05;
  const partial = (type, freq, lvl, to = g) => {
    const o = osc(type, freq, false), og = gain(lvl);
    o.connect(og).connect(to); o.start(t); o.stop(end);
    own.push(o, og); srcs.push(o);
  };
  if (wave === 'bell') { partial('sine', f, 1); partial('sine', f * 2.76, 0.25); partial('sine', f * 5.4, 0.06); }
  else if (wave === 'musicbox') { partial('sine', f, 1); partial('sine', f * 4, 0.18); partial('triangle', f * 2, 0.1); }
  else if (wave === 'pluck') {
    const lp = filter('lowpass', f * 8, 2); lp.connect(g); own.push(lp);
    lp.frequency.setValueAtTime(f * 8, t); lp.frequency.exponentialRampToValueAtTime(f * 1.2, t + decay * 0.8);
    partial('triangle', f, 1, lp); partial('sawtooth', f * 1.003, 0.3, lp);
  } else if (wave === 'square') {
    const lp = filter('lowpass', 2200, 0.5); lp.connect(g); own.push(lp); partial('square', f, 0.35, lp);
  } else partial('sine', f, 1);
  release(own, srcs);
  return srcs;
}

// ───────────────────────── Grafo base ──────────────────────────
function buildGraph() {
  const n = {};
  n.out = ctx.createDynamicsCompressor();
  n.out.threshold.value = -18; n.out.knee.value = 12; n.out.ratio.value = 3;
  n.out.attack.value = 0.02; n.out.release.value = 0.3;
  n.analyser = ctx.createAnalyser(); n.analyser.fftSize = 2048; n.analyser.smoothingTimeConstant = 0.85;
  n.master = gain(muted ? 0 : curve(volumes.master));
  n.master.connect(n.out); n.out.connect(n.analyser); n.analyser.connect(ctx.destination);

  // Reverb compartida con impulso generado; su cantidad cambia por sala.
  n.reverb = ctx.createConvolver(); n.reverb.buffer = impulse(3.8, 2.8, 0.022);
  n.reverbWet = gain(0.35);
  n.reverb.connect(n.reverbWet).connect(n.master);

  n.layer = {};
  for (const l of LAYERS.slice(1)) { n.layer[l] = gain(curve(volumes[l])); n.layer[l].connect(n.master); }
  const send = (node, amount) => { node.connect(gain(amount)).connect(n.reverb); };
  send(n.layer.musica, 0.9); send(n.layer.efectos, 0.35); send(n.layer.ambiente, 0.3);

  // Bucles de longitudes distintas para que no se note la repetición.
  n.noise = { white: noiseBuffer(3, 'white'), pink: noiseBuffer(7.3, 'pink'), brown: noiseBuffer(6.1, 'brown') };

  // Motores: graves senoidales con batido lento (dos fundamentales separadas 0,21 Hz),
  // armónicos para que se oiga en altavoces pequeños y ruido marrón con respiración.
  n.engineRoom = gain(0); n.engineRoom.connect(n.layer.motores);
  const eng = gain(1); eng.connect(n.engineRoom);
  lfo(0.11, 0.1, eng.gain);
  const f0 = 43.65; // Fa1, por debajo de casi toda la música
  [[f0, 'sine', 0.2, 0], [f0 + 0.21, 'sine', 0.16, 0], [f0 * 2, 'sine', 0.2, 3], [f0 * 3, 'triangle', 0.07, -4], [f0 * 4.01, 'sine', 0.03, 0]]
    .forEach(([f, type, lvl, det]) => { const o = osc(type, f); o.detune.value = det; o.connect(gain(lvl)).connect(eng); });
  n.engineFilter = filter('lowpass', 160, 1.2);
  lfo(0.07, 40, n.engineFilter.frequency);
  loop(n.noise.brown).connect(n.engineFilter).connect(gain(0.9)).connect(eng);
  const pulse = gain(0.5); lfo(0.5, 0.5, pulse.gain);             // latido leve del reactor
  osc('sine', 87.3).connect(gain(0.04)).connect(pulse).connect(eng);

  // Aire: ruido rosa filtrado que cambia de color por sala y fluctúa despacio.
  n.airRoom = gain(0); n.airRoom.connect(n.layer.ambiente);
  const airMod = gain(1); lfo(0.05, 0.22, airMod.gain); airMod.connect(n.airRoom);
  n.airFilter = filter('lowpass', 600, 0.5);
  lfo(0.031, 70, n.airFilter.frequency);
  loop(n.noise.pink).connect(filter('highpass', 60)).connect(n.airFilter).connect(gain(0.55)).connect(airMod);
  n.events = gain(1); n.events.connect(n.layer.ambiente);
  return n;
}

// ──────────────────── Texturas por sala ────────────────────────
// Sonidos continuos que viven con la voz de la sala y se funden con ella.
function buildTexture(kind, out, src, parts) {
  const keep = (s) => { src.push(s); return s; };
  // Cada nodo intermedio se guarda para desconectarlo al apagar la sala.
  const own = (n) => { parts.push(n); return n; };
  const G = (v) => own(gain(v)), F = (type, f, Q) => own(filter(type, f, Q)), P = (v) => own(panner(v));
  if (kind === 'turbine') {
    const o = keep(osc('sawtooth', 220)); keep(lfo(0.2, 3, o.frequency));
    o.connect(F('bandpass', 660, 10)).connect(G(0.05)).connect(out);
    keep(loop(nodes.noise.pink)).connect(F('bandpass', 400, 2)).connect(G(0.35)).connect(out);
  } else if (kind === 'projector') {
    // Obturador a 24 fotogramas por segundo y motor del proyector.
    const am = G(0.5); keep(lfo(24, 0.5, am.gain, 'square'));
    keep(loop(nodes.noise.white)).connect(F('bandpass', 2300, 1.4)).connect(am).connect(G(0.05)).connect(out);
    keep(osc('sine', 96)).connect(G(0.03)).connect(out);
    keep(osc('triangle', 192)).connect(G(0.008)).connect(out);
  } else if (kind === 'servers') {
    keep(loop(nodes.noise.pink)).connect(F('highpass', 1800)).connect(F('lowpass', 6000)).connect(G(0.3)).connect(out);
    keep(osc('square', 120)).connect(F('lowpass', 380)).connect(G(0.02)).connect(out);
  } else if (kind === 'stars') {
    // Viento solar y un brillo agudo que aparece y desaparece.
    const wind = G(0.5); keep(lfo(0.07, 0.5, wind.gain));
    keep(loop(nodes.noise.white)).connect(F('bandpass', 5500, 0.6)).connect(wind).connect(G(0.02)).connect(out);
    [2637.02, 3135.96, 3951.07].forEach((f, i) => {
      const tr = G(0.5); keep(lfo(0.05 + i * 0.023, 0.5, tr.gain));
      keep(osc('sine', f)).connect(tr).connect(G(0.004)).connect(P(i - 1)).connect(out);
    });
  }
  // 'clock' es discreto: lo programa tick().
}

function clockTick(dest, t, tock) {
  noiseHit(dest, t, 0.3, 'bandpass', tock ? 1800 : 2500, 6, 0.04);
  playTone(dest, tock ? 1250 : 1650, t, 'sine', 0.06, 0.015);
}

// ─────────────────────── Música por sala ───────────────────────
function createVoice(id) {
  const room = ROOMS[id];
  const bus = gain(0); bus.connect(nodes.layer.musica);
  const tex = gain(0); tex.connect(nodes.layer.ambiente);
  const padFilter = filter('lowpass', room.pad.cutoff, 0.9);
  const stops = [lfo(0.045, room.pad.cutoff * 0.35, padFilter.frequency)];
  const parts = [padFilter];
  padFilter.connect(bus);
  // Campanas con eco suave
  const bells = gain(1); bells.connect(bus);
  const delay = ctx.createDelay(2); delay.delayTime.value = (60 / room.tempo) * 0.75;
  const fb = gain(0.32), dlp = filter('lowpass', 2200), wet = gain(0.5);
  bells.connect(delay); delay.connect(dlp).connect(fb).connect(delay); dlp.connect(wet).connect(bus);
  parts.push(bells, delay, fb, dlp, wet);
  if (room.texture) buildTexture(room.texture, tex, stops, parts);
  const t = now() + 0.05;
  return {
    id, room, bus, tex, padFilter, bells, stops, parts,
    nextChord: t, nextBeat: t + 60 / room.tempo, nextClock: t + 0.4, clockSide: 0,
    chordIdx: 0, chord: room.chords[0], arp: 0, stopped: false, endAt: Infinity,
  };
}

function fadeOutVoice(v, t, fade) {
  v.stopped = true;
  const tc = Math.max(0.03, fade / 4);
  hold(v.bus.gain, t); v.bus.gain.setTargetAtTime(0, t, tc);
  hold(v.tex.gain, t); v.tex.gain.setTargetAtTime(0, t, tc);
  v.endAt = t + Math.max(0.3, fade * 1.6);
}

function killVoice(v) {
  v.stops.forEach((s) => {
    try { s.stop(); } catch { /* ya parado */ }
    s.disconnect(); if (s.depth) s.depth.disconnect();
  });
  [v.bus, v.tex, ...v.parts].forEach((n) => n.disconnect());
}

function scheduleChord(v, t) {
  const r = v.room; const beat = 60 / r.tempo; const dur = r.chordBeats * beat;
  const chord = r.chords[v.chordIdx % r.chords.length];
  // De vez en cuando la música respira: ese acorde solo lleva el bajo.
  const rest = v.chordIdx > 1 && Math.random() < 0.12;
  v.chord = chord; v.chordIdx++;
  const attack = Math.min(3, dur * 0.35), rel = Math.min(5, dur * 0.5);
  const peak = 0.045 * r.pad.level;
  const notes = rest ? [] : chord.map((s) => r.root + s);
  notes.push(r.root + chord[0] - 12); // bajo
  notes.forEach((m, i) => {
    const isBass = i === notes.length - 1;
    const lvl = isBass ? peak * (rest ? 1 : 1.4) : peak;
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl, t + attack);
    g.gain.setValueAtTime(lvl, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + rel);
    g.connect(isBass ? v.bus : v.padFilter);
    const own = [g], srcs = [];
    const oscs = isBass ? [[0, 'sine']] : [[-r.pad.detune, r.pad.wave], [r.pad.detune, r.pad.wave]];
    oscs.forEach(([det, type]) => {
      const o = osc(type, mtof(m), false); o.detune.value = det;
      const pan = panner(isBass ? 0 : rand(-0.6, 0.6));
      o.connect(pan).connect(g);
      o.start(t); o.stop(t + dur + rel + 0.1);
      own.push(o, pan); srcs.push(o);
    });
    release(own, srcs);
  });
  return dur;
}

function scheduleBell(v, t) {
  const r = v.room; const b = r.bell;
  let m;
  if (b.pattern === 'arp') {
    // Arpegio de ida y vuelta sobre el acorde actual y su octava.
    const seq = [...v.chord, ...v.chord.map((x) => x + 12)].sort((a, c) => a - c);
    const cyc = 2 * seq.length - 2; let i = v.arp % cyc; if (i >= seq.length) i = cyc - i;
    m = r.root + 12 * (b.octave - 1) + seq[i];
  } else {
    // Dos de cada tres notas son del acorde que suena; el resto, de la escala.
    const pcs = Math.random() < 0.65 ? v.chord.map((s) => ((s % 12) + 12) % 12) : r.scale;
    m = r.root + 12 * b.octave + pick(pcs) + (Math.random() < 0.2 ? 12 : 0);
  }
  playTone(v.bells, mtof(m), t, b.wave, b.decay, 0.11 * rand(0.55, 1), rand(-0.7, 0.7));
}

// ──────────────────── Sonidos sueltos de sala ──────────────────
function ambientEvent(kind, t) {
  const out = panner(rand(-0.8, 0.8)); out.connect(nodes.events);
  const srcs = []; const add = (x) => { if (Array.isArray(x)) srcs.push(...x); else srcs.push(x); };
  const own = [out];
  if (kind === 'blip') {
    const base = pick([1318.51, 1567.98, 1760, 2093]);
    add(playTone(out, base, t, 'sine', 0.12, 0.05));
    if (Math.random() < 0.6) add(playTone(out, base * pick([1.25, 1.5, 0.75]), t + 0.11, 'sine', 0.12, 0.04));
  } else if (kind === 'hiss') {
    // Escape de vapor
    const s = ctx.createBufferSource(); s.buffer = nodes.noise.white;
    const g = gain(0), fl = filter('bandpass', rand(2500, 4500), 0.8); const d = rand(0.8, 2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.15); g.gain.linearRampToValueAtTime(0, t + d);
    s.connect(fl).connect(g).connect(out);
    s.start(t, Math.random()); s.stop(t + d + 0.1);
    add(s); own.push(s, g, fl);
  } else if (kind === 'creak') {
    // Estructura que cruje
    const f = rand(70, 120); const o = osc('sawtooth', f, false);
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * rand(0.8, 1.3), t + 1.2);
    const g = gain(0), fl = filter('bandpass', f * 4, 6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.4); g.gain.linearRampToValueAtTime(0, t + 1.3);
    o.connect(fl).connect(g).connect(out); o.start(t); o.stop(t + 1.4);
    add(o); own.push(o, g, fl);
  } else if (kind === 'chirp') {
    // Máquina recreativa al fondo
    const f = rand(600, 1200); const o = osc('square', f, false);
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2, t + 0.08);
    const g = gain(0), fl = filter('lowpass', 1800);
    g.gain.setValueAtTime(0.015, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(fl).connect(g).connect(out); o.start(t); o.stop(t + 0.2);
    add(o); own.push(o, g, fl);
  } else if (kind === 'tick') {
    // El casco se dilata: un "tic" metálico con parciales inarmónicos.
    const f = rand(450, 1200);
    add(noiseHit(out, t, 0.08, 'highpass', 3000, 0.7, 0.01));
    [[1, 0.02, 0.6], [1.59, 0.013, 0.45], [2.14, 0.009, 0.35], [2.83, 0.006, 0.25]]
      .forEach(([k, l, d]) => add(playTone(out, f * k, t, 'sine', d, l)));
  } else if (kind === 'typing') {
    // Alguien escribe en la bitácora
    let tt = t; const n = 4 + ((Math.random() * 9) | 0);
    for (let i = 0; i < n; i++) {
      const space = Math.random() < 0.15;
      add(noiseHit(out, tt, space ? 0.05 : 0.07, 'bandpass', space ? 1200 : rand(2000, 3400), 2.5, 0.03));
      add(thud(out, tt, space ? 160 : rand(200, 260), 0.025, 0.04, 0.8));
      tt += rand(0.08, 0.2) * (Math.random() < 0.12 ? 3 : 1);
    }
  } else if (kind === 'dice') {
    // Dos dados rodando sobre la mesa
    for (let d = 0; d < 2; d++) {
      let tt = t + d * rand(0.01, 0.05), gap = rand(0.1, 0.16), lvl = 0.09;
      const n = 5 + ((Math.random() * 4) | 0);
      for (let i = 0; i < n; i++) {
        add(noiseHit(out, tt, lvl, 'bandpass', rand(2200, 3800), 4, 0.02));
        add(playTone(out, rand(800, 1300), tt, 'sine', 0.04, lvl * 0.25));
        tt += gap; gap *= rand(0.6, 0.78); lvl *= 0.75;
      }
    }
  }
  if (srcs.length) release(own, srcs); else out.disconnect();
}

// ───────────────────────── Planificador ────────────────────────
function tick() {
  if (!running()) return;
  const t = now(); const dt = Math.min(1, t - lastTick); lastTick = t;
  // Con la pestaña oculta los temporizadores van a 1 Hz: programamos más adelante.
  const ahead = document.hidden ? 1.6 : 0.5;
  for (const v of voices) {
    if (v.stopped) continue;
    const r = v.room; const beat = 60 / r.tempo;
    // Si el planificador se ha quedado atrás, saltamos lo perdido en vez de amontonarlo.
    if (v.nextChord < t) v.nextChord = t;
    while (v.nextChord < t + ahead) v.nextChord += scheduleChord(v, v.nextChord);
    if (v.nextBeat < t) v.nextBeat = t;
    const arp = r.bell.pattern === 'arp';
    while (v.nextBeat < t + ahead) {
      if (Math.random() < r.bell.density) scheduleBell(v, v.nextBeat + rand(0, 0.012));
      v.nextBeat += arp ? beat / 2 : beat * (Math.random() < 0.25 ? 0.5 : 1);
      if (arp) v.arp++;
    }
    if (r.texture === 'clock') {
      if (v.nextClock < t) v.nextClock = t;
      while (v.nextClock < t + ahead) { clockTick(v.tex, v.nextClock, (v.clockSide ^= 1)); v.nextClock += 1; }
    }
  }
  const done = voices.filter((v) => v.stopped && t > v.endAt);
  if (done.length) { done.forEach(killVoice); voices = voices.filter((v) => !done.includes(v)); }
  const room = ROOMS[roomId];
  if (room) for (const [k, rate] of Object.entries(room.events)) if (Math.random() < rate * dt) ambientEvent(k, t + 0.05);
}

// ──────────────── Desbloqueo y pestaña oculta ──────────────────
function armUnlock() {
  if (unlock || !ctx) return;
  unlock = () => {
    if (!ctx) { disarmUnlock(); return; }
    ctx.resume().then(() => { if (running()) disarmUnlock(); }).catch(() => {});
  };
  UNLOCK_EVENTS.forEach((e) => document.addEventListener(e, unlock, true));
}
function disarmUnlock() {
  if (!unlock) return;
  UNLOCK_EVENTS.forEach((e) => document.removeEventListener(e, unlock, true));
  unlock = null;
}
function onVisibility() {
  if (!ctx) return;
  if (document.hidden) {
    if (options.pauseWhenHidden && ctx.state === 'running') { pausedByHidden = true; ctx.suspend(); }
  } else if (pausedByHidden) {
    pausedByHidden = false;
    ctx.resume().catch(() => {});
    setTimeout(() => { if (ctx && !running()) armUnlock(); }, 500);   // iOS puede pedir otro toque
  }
}
function onStateChange() {
  if (!ctx) return;
  if (running()) disarmUnlock();
  else if (ctx.state !== 'closed' && !pausedByHidden && !document.hidden) armUnlock();
  emit();
}

// ───────────────────────────── API ─────────────────────────────

/**
 * Crea el contexto de audio y arranca las capas. Llamar dentro de un gesto del
 * usuario (click, tecla, toque). Si el navegador lo bloquea, el audio arranca
 * solo en el siguiente click o tecla. Idempotente: devuelve la misma promesa.
 * @param {{room?: string, fade?: number, volumes?: object, pauseWhenHidden?: boolean}} [opts]
 */
export function init(opts = {}) {
  if (initPromise) return initPromise;
  if (typeof window === 'undefined') return Promise.reject(new Error('audio-nave solo funciona en el navegador'));
  initPromise = (async () => {
    if (opts.fade != null) options.fade = Math.max(0, Number(opts.fade) || 0);
    if (opts.pauseWhenHidden != null) options.pauseWhenHidden = !!opts.pauseWhenHidden;
    if (opts.volumes) for (const [k, v] of Object.entries(opts.volumes)) {
      const l = layerName(k); if (LAYERS.includes(l)) volumes[l] = clamp(Number(v) || 0, 0, 1);
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Este navegador no tiene Web Audio API');
    let c; try { c = new AC({ latencyHint: 'interactive' }); } catch { c = new AC(); }
    ctx = c;
    // resume() tiene que salir dentro del gesto: antes de cualquier await.
    const resuming = ctx.state === 'running' ? null : ctx.resume().catch(() => {});
    ctx.onstatechange = onStateChange;
    nodes = buildGraph();
    lastTick = now();
    timer = setInterval(tick, 100);
    document.addEventListener('visibilitychange', onVisibility);
    const first = opts.room || roomId || 'pasillo'; roomId = null;
    setRoom(first, { fade: 2 });
    if (resuming) await Promise.race([resuming, wait(400)]);
    if (ctx && !running()) armUnlock();
    if (ctx && document.hidden) onVisibility();
    emit();
    return getState();
  })();
  initPromise.catch(() => {
    initPromise = null; clearInterval(timer); timer = null;
    if (ctx) ctx.close().catch(() => {});
    ctx = null; nodes = null;
  });
  return initPromise;
}

/**
 * Cambia de sala con fundido cruzado de música, textura, motor, aire y reverb.
 * Llamar varias veces con la misma sala no hace nada, así que vale en cada fotograma.
 * @param {string} id uno de Object.keys(ROOMS)
 * @param {{fade?: number}} [opts] segundos de fundido (por defecto 3)
 */
export function setRoom(id, opts = {}) {
  if (!ROOMS[id]) { console.warn(`[audio-nave] sala desconocida "${id}", uso "pasillo"`); id = 'pasillo'; }
  if (!ctx) { if (roomId !== id) { roomId = id; emit(); } return; }   // se aplicará en init()
  const current = voices.find((v) => !v.stopped);
  if (current && current.id === id) return;
  const fade = Math.max(0, opts.fade ?? options.fade);
  const t = now(), tc = Math.max(0.03, fade / 3), room = ROOMS[id];
  if (current) fadeOutVoice(current, t, fade);
  // Volver a una sala que aún se está apagando la recupera (evita amontonar voces
  // si el jugador va y viene por una puerta).
  let v = voices.find((x) => x.id === id && x.stopped);
  if (v) { v.stopped = false; v.endAt = Infinity; } else { v = createVoice(id); voices.push(v); }
  rampTo(v.bus.gain, room.music, t, fade);
  rampTo(v.tex.gain, 1, t, fade);
  glide(nodes.engineRoom.gain, room.engine, t, tc);
  glide(nodes.airRoom.gain, room.air, t, tc);
  glide(nodes.airFilter.frequency, room.airCutoff, t, tc);
  glide(nodes.engineFilter.frequency, 110 + room.engine * 120, t, tc);
  glide(nodes.reverbWet.gain, room.reverb, t, tc);
  roomId = id;
  emit();
}

/**
 * Puerta neumática: aviso de dos tonos, pestillo, servo, siseo y golpe.
 * @param {'open'|'close'} [kind]
 * @param {{pan?: number}} [opts] -1 izquierda … 1 derecha
 */
export function playDoor(kind = 'open', opts = {}) {
  if (!running()) return;
  const open = kind !== 'close';
  const t = now() + 0.01;
  const out = panner(opts.pan ?? 0); out.connect(nodes.layer.efectos);
  const srcs = [];
  (open ? [880, 1318.51] : [1318.51, 880]).forEach((f, i) => srcs.push(...playTone(out, f, t + i * 0.09, 'sine', 0.35, 0.045)));
  // Pestillo
  srcs.push(noiseHit(out, t + 0.1, 0.22, 'bandpass', 3000, 3, 0.03));
  srcs.push(thud(out, t + 0.1, 320, 0.08, 0.04, 0.7));
  // Siseo neumático
  const ts = t + 0.14, d = open ? 0.75 : 0.6;
  const s = ctx.createBufferSource(); s.buffer = nodes.noise.white;
  const bp = filter('bandpass', open ? 2400 : 700, 1.1); const g = gain(0);
  bp.frequency.setValueAtTime(open ? 2400 : 700, ts);
  bp.frequency.exponentialRampToValueAtTime(open ? 500 : 2000, ts + d);
  g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(0.3, ts + 0.04); g.gain.exponentialRampToValueAtTime(0.001, ts + d);
  s.connect(bp).connect(g).connect(out); s.start(ts, Math.random()); s.stop(ts + d + 0.05);
  srcs.push(s); const own = [out, s, bp, g];
  // Servo de la hoja: dos sierras desafinadas que suben (abrir) o bajan (cerrar)
  const sg = gain(0); const sbp = filter('bandpass', 700, 3); sbp.connect(sg).connect(out); own.push(sg, sbp);
  sg.gain.setValueAtTime(0, ts); sg.gain.linearRampToValueAtTime(0.05, ts + 0.08); sg.gain.linearRampToValueAtTime(0, ts + d);
  [0, 9].forEach((det) => {
    const m = osc('sawtooth', open ? 180 : 250, false); m.detune.value = det;
    m.frequency.setValueAtTime(open ? 180 : 250, ts); m.frequency.linearRampToValueAtTime(open ? 260 : 170, ts + d);
    m.connect(sbp); m.start(ts); m.stop(ts + d + 0.05);
    srcs.push(m); own.push(m);
  });
  // Golpe final; al cerrar, además, la chapa vibra.
  const tk = ts + d - 0.08;
  srcs.push(thud(out, tk, open ? 95 : 120, open ? 0.35 : 0.5, 0.35, 0.4));
  if (!open) srcs.push(...playTone(out, 210, tk, 'bell', 0.6, 0.035));
  release(own, srcs);
}

/**
 * Un paso. Sin surface usa el suelo de la sala actual (ROOMS[id].floor).
 * @param {{surface?: 'metal'|'rejilla'|'moqueta'|'madera', intensity?: number, pan?: number}} [opts]
 */
export function footstep(opts = {}) {
  if (!running()) return;
  const surface = SURFACES.includes(opts.surface) ? opts.surface : (ROOMS[roomId]?.floor || 'metal');
  const k = clamp(opts.intensity ?? 1, 0, 1.5);
  const t = now() + 0.005; stepSide = -stepSide;
  const out = panner(stepSide * 0.18 + (opts.pan || 0)); out.connect(nodes.layer.efectos);
  const soft = surface === 'moqueta';
  // Talón (roce + golpe grave) y, un instante después, la puntera.
  const srcs = [
    noiseHit(out, t, 0.16 * k, 'lowpass', soft ? rand(500, 700) : rand(1100, 1600), 0.8, soft ? 0.12 : 0.08),
    noiseHit(out, t + rand(0.045, 0.07), 0.07 * k, 'lowpass', soft ? 600 : rand(1400, 2000), 0.8, soft ? 0.08 : 0.05),
    thud(out, t, rand(75, 95) * (surface === 'madera' ? 1.25 : 1), 0.3 * k, soft ? 0.1 : 0.14, 0.55),
  ];
  // Lo que suena el suelo
  if (surface === 'metal') srcs.push(noiseHit(out, t, 0.3 * k, 'bandpass', rand(2000, 2600), 14, 0.16));
  else if (surface === 'rejilla') {
    srcs.push(noiseHit(out, t, 0.5 * k, 'bandpass', rand(3200, 3800), 14, 0.25));
    srcs.push(noiseHit(out, t + 0.012, 0.25 * k, 'bandpass', rand(4200, 4800), 18, 0.18));
  } else if (surface === 'madera') srcs.push(noiseHit(out, t, 0.35 * k, 'bandpass', rand(350, 550), 5, 0.09));
  release([out], srcs);
}

/**
 * Pasos automáticos mientras el jugador se mueve. Idempotente: llamarlo otra vez
 * con on=true solo actualiza ritmo y suelo, no reinicia la cadencia.
 * @param {boolean} on
 * @param {{rate?: number, surface?: string}} [opts] rate en pasos por segundo (1,8 por defecto)
 */
export function setWalking(on, opts = {}) {
  if (!on || !ctx) {
    if (walking) { clearTimeout(walking.timer); walking = null; emit(); }
    return;
  }
  const rate = clamp(Number(opts.rate) || 1.8, 0.3, 6);
  if (walking) { walking.rate = rate; walking.surface = opts.surface; return; }
  walking = { rate, surface: opts.surface, timer: 0 };
  const step = () => {
    if (!walking) return;
    footstep({ surface: walking.surface, intensity: rand(0.8, 1) });
    walking.timer = setTimeout(step, (1000 / walking.rate) * rand(0.94, 1.06));
  };
  step(); emit();
}

/** Pitido de interfaz (consola, menús). */
export function beep(kind = 'ok') {
  if (!running()) return;
  const t = now() + 0.005; const out = nodes.layer.efectos;
  if (kind === 'error') { playTone(out, 330, t, 'square', 0.18, 0.05); playTone(out, 262, t + 0.12, 'square', 0.25, 0.05); }
  else { playTone(out, 1567.98, t, 'sine', 0.15, 0.06); playTone(out, 2093, t + 0.07, 'sine', 0.2, 0.05); }
}

/**
 * Volumen de una capa (0..1): 'master', 'motores', 'ambiente', 'musica', 'efectos'
 * (también acepta engine, ambient, music, fx). Se puede llamar antes de init().
 */
export function setVolume(layer, value) {
  const l = layerName(layer);
  if (!LAYERS.includes(l)) { console.warn(`[audio-nave] capa desconocida "${layer}"`); return; }
  volumes[l] = clamp(Number(value) || 0, 0, 1);
  if (ctx && !(l === 'master' && muted)) glide((l === 'master' ? nodes.master : nodes.layer[l]).gain, curve(volumes[l]), now());
  emit();
}

export function getVolume(layer) { return volumes[layerName(layer)]; }

/** Silencia o restaura todo sin perder los volúmenes. Se recuerda aunque se llame antes de init(). */
export function setMuted(value) {
  muted = !!value;
  if (ctx) glide(nodes.master.gain, muted ? 0 : curve(volumes.master), now(), 0.08);
  emit();
}

/** AnalyserNode de la salida, para visualizadores. null antes de init(). */
export function getAnalyser() { return nodes ? nodes.analyser : null; }

/**
 * ready: init() hecho · running: sonando de verdad (false si el navegador lo
 * tiene en pausa o la pestaña está oculta) · voices: voces de sala vivas.
 */
export function getState() {
  return {
    ready: !!ctx,
    running: running(),
    room: roomId,
    roomName: roomId ? ROOMS[roomId].name : null,
    floor: roomId ? ROOMS[roomId].floor : null,
    volumes: { ...volumes },
    muted,
    walking: !!walking,
    voices: voices.length,
  };
}

/** Suscribirse a cambios de estado. Devuelve la función para desuscribirse. */
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Para todo y libera el contexto. Después se puede volver a llamar a init(). */
export async function dispose() {
  if (initPromise) { try { await initPromise; } catch { /* nada que limpiar */ } }
  if (walking) { clearTimeout(walking.timer); walking = null; }
  clearInterval(timer); timer = null;
  disarmUnlock();
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
  voices = []; pausedByHidden = false;
  const c = ctx; ctx = null; nodes = null; initPromise = null;
  if (c) { c.onstatechange = null; try { await c.close(); } catch { /* ya cerrado */ } }
  emit();
}

const AudioNave = {
  ROOMS, SURFACES, init, setRoom, playDoor, footstep, setWalking, beep,
  setVolume, getVolume, setMuted, getAnalyser, getState, onChange, dispose,
};
export default AudioNave;
