// Zumbido ambiental de la nave, generado con Web Audio (sin ficheros de sonido):
// un motor grave de ruido filtrado y un acorde suave que respira muy despacio.
let ctx = null
let master = null

function brownNoise(context) {
  const length = context.sampleRate * 4
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.5
  }
  const src = context.createBufferSource()
  src.buffer = buffer
  src.loop = true
  return src
}

function start() {
  ctx = new AudioContext()
  master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)

  // Motor: ruido marrón muy filtrado.
  const engine = brownNoise(ctx)
  const engineFilter = ctx.createBiquadFilter()
  engineFilter.type = 'lowpass'
  engineFilter.frequency.value = 180
  const engineGain = ctx.createGain()
  engineGain.gain.value = 0.5
  engine.connect(engineFilter).connect(engineGain).connect(master)
  engine.start()

  // Acorde suave (La menor añadida), con un LFO lento en el volumen.
  const pad = ctx.createGain()
  pad.gain.value = 0.05
  const padFilter = ctx.createBiquadFilter()
  padFilter.type = 'lowpass'
  padFilter.frequency.value = 900
  pad.connect(padFilter).connect(master)
  for (const [freq, detune] of [[110, -4], [164.81, 3], [220, 5], [246.94, -6], [329.63, 2]]) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    osc.detune.value = detune
    osc.connect(pad)
    osc.start()
  }
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.05
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 0.03
  lfo.connect(lfoGain).connect(pad.gain)
  lfo.start()
}

export function setAmbient(on) {
  if (on && !ctx) start()
  if (!ctx) return
  if (on) ctx.resume()
  const now = ctx.currentTime
  master.gain.cancelScheduledValues(now)
  master.gain.setValueAtTime(master.gain.value, now)
  master.gain.linearRampToValueAtTime(on ? 0.35 : 0, now + 1.5)
  if (!on) setTimeout(() => ctx && master.gain.value < 0.01 && ctx.suspend(), 1700)
}
